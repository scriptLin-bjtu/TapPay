import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { isAddress, formatUnits } from 'ethers';
import {
  CHAIN_ID,
  SUPPORTED_TOKEN_TYPE,
} from '@particle-network/universal-account-sdk';
import { useMagic } from '@/hooks/MagicProvider';
import { useUniversalAccount } from '@/hooks/UniversalAccountProvider';
import {
  ARB_USDC,
  TAPAY_ADDRESS,
  OrderStatus,
  readOrder,
  encodeApprove,
  encodePay,
  type LatestOrder,
} from '@/utils/contracts';
import { saveUserInfo } from '@/utils/common';
import showToast from '@/utils/showToast';
import Spinner from '@/components/ui/Spinner';

const ORDER_LIFESPAN = 300; // 5 minutes, matches TapPay.sol ORDER_LIFESPAN
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

type Phase =
  | 'LOADING'
  | 'INVALID_LINK'
  | 'NEEDS_LOGIN'
  | 'NO_ORDER'
  | 'EXPIRED'
  | 'ALREADY_PAID'
  | 'CANCELLED'
  | 'READY'
  | 'PAYING'
  | 'PAID'
  | 'ERROR';

export default function PayPage() {
  const router = useRouter();
  const { magic } = useMagic();
  const { universalAccount, accountInfo, ensureDelegated, signAndSend } = useUniversalAccount();

  const [merchant, setMerchant] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<bigint | null>(null);
  const [token, setToken] = useState('');
  const [order, setOrder] = useState<LatestOrder | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [txId, setTxId] = useState('');
  const [payError, setPayError] = useState('');

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem('token') ?? '');
  }, []);

  // Handle OAuth redirect callback: after Google login, Magic redirects back here
  // with the result. getRedirectResult() resolves only once per redirect.
  // router is a stable singleton, intentionally omitted from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!magic) return;
    let active = true;
    magic.oauth2
      .getRedirectResult()
      .then((result) => {
        if (!active) return;
        const meta = result?.magic?.userMetadata;
        const addr = meta?.wallets?.ethereum?.publicAddress;
        const idToken = result?.magic?.idToken;
        if (addr && idToken) {
          setToken(idToken);
          saveUserInfo(idToken, 'SOCIAL', addr);
          // Restore the merchant & orderId params stripped before the Google redirect.
          const m = sessionStorage.getItem('tappay_merchant');
          const o = sessionStorage.getItem('tappay_orderId');
          if (m) {
            sessionStorage.removeItem('tappay_merchant');
            sessionStorage.removeItem('tappay_orderId');
            router.replace({ pathname: '/pay', query: { m, o } }, undefined, { shallow: true });
          }
        }
      })
      .catch((e) => {
        // No redirect result (normal when not coming back from OAuth) — ignore.
        // MISSING_PKCE_METADATA fires when getRedirectResult is called outside a
        // real OAuth callback (e.g. plain refresh after login), which is expected.
        const msg = e?.message || '';
        const code = e?.code || '';
        const benign =
          /empty|no result|parse|pkce|metadata|session/i.test(msg) ||
          /PKCE|METADATA/i.test(code);
        if (!benign) {
          console.error('oauth redirect result error', e);
        }
      });
    return () => {
      active = false;
    };
  }, [magic]);

  const handleGoogleLogin = useCallback(async () => {
    if (!magic) return;
    setLoggingIn(true);
    // Stash merchant & orderId so we can restore the params after the OAuth round-trip.
    // Google OAuth rejects redirect URIs with query strings, so we redirect to
    // the bare /pay path and reattach params here once getRedirectResult resolves.
    if (merchant) {
      sessionStorage.setItem('tappay_merchant', merchant);
      if (orderId !== null) sessionStorage.setItem('tappay_orderId', orderId.toString());
    }
    try {
      await magic.oauth2.loginWithRedirect({
        provider: 'google',
        redirectURI: window.location.origin + '/pay',
      });
    } catch (e: any) {
      console.error('google login error:', e);
      showToast({ message: 'Google login failed: ' + (e?.message || String(e)), type: 'error' });
      setLoggingIn(false);
    }
  }, [magic, merchant, orderId]);

  useEffect(() => {
    if (!router.isReady) return;
    const qm = router.query.m;
    const qo = router.query.o;
    const m = typeof qm === 'string' ? qm : '';
    const o = typeof qo === 'string' ? qo : '';
    setMerchant(m && isAddress(m) ? m : '');
    try {
      setOrderId(o ? BigInt(o) : null);
    } catch {
      setOrderId(null);
    }
  }, [router.isReady, router.query.m, router.query.o]);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (merchant === null) return;
    if (merchant === '' || orderId === null) return;
    let alive = true;
    const fetchOnce = async () => {
      try {
        const o = await readOrder(orderId);
        if (!alive) return;
        setOrder(o);
      } catch (e) {
        console.error('fetch order failed', e);
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [merchant, orderId]);

  const phase = useMemo<Phase>(() => {
    if (paid) return 'PAID';
    if (paying) return 'PAYING';
    if (merchant === null) return 'LOADING';
    if (merchant === '' || orderId === null) return 'INVALID_LINK';
    if (!token) return 'NEEDS_LOGIN';
    if (!order) return 'LOADING';
    if (order.orderId === 0n) return 'NO_ORDER';
    if (order.status === OrderStatus.PAID) return 'ALREADY_PAID';
    if (order.status === OrderStatus.CANCELLED) return 'CANCELLED';
    if (order.status !== OrderStatus.OPEN) return 'CANCELLED';
    if (now > order.expiresAt) return 'EXPIRED';
    return 'READY';
  }, [paid, paying, merchant, orderId, token, order, now]);

  const handleLogin = useCallback(async () => {
    if (!magic) return;
    if (!EMAIL_RE.test(email)) {
      setEmailError(true);
      return;
    }
    setLoggingIn(true);
    try {
      const t = await magic.auth.loginWithEmailOTP({ email });
      const info = await magic.user.getInfo();
      const addr = info?.wallets?.ethereum?.publicAddress;
      if (!t || !addr) throw new Error('Magic login failed');
      setToken(t);
      saveUserInfo(t, 'EMAIL', addr);
      setEmail('');
    } catch (e: any) {
      console.error('login error:', e);
      showToast({ message: 'Login failed: ' + (e?.message || String(e)), type: 'error' });
    } finally {
      setLoggingIn(false);
    }
  }, [magic, email]);

  const handlePay = useCallback(async () => {
    if (!order || !universalAccount) return;
    setPaying(true);
    setPayError('');
    try {
      await ensureDelegated();
      // expectTokens.amount is a HUMAN-READABLE decimal string (e.g. "0.01"),
      // NOT the 6-decimal raw value. order.amount is raw (10000 = 0.01 USDC),
      // so convert it — passing "10000" would tell UA we need 10000 USDC.
      const tx = await universalAccount.createUniversalTransaction({
        chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE,
        expectTokens: [{ type: SUPPORTED_TOKEN_TYPE.USDC, amount: formatUnits(order.amount, 6) }],
        transactions: [
          { to: ARB_USDC, data: encodeApprove(TAPAY_ADDRESS, order.amount), value: '0' },
          { to: TAPAY_ADDRESS, data: encodePay(order.orderId), value: '0' },
        ],
      });
      const result = await signAndSend(tx);
      setTxId(result.transactionId);
      setPaid(true);
      showToast({ message: 'Payment successful!', type: 'success' });
    } catch (e: any) {
      console.error('pay failed', e);
      setPayError(e?.message || String(e));
      setPaying(false);
      showToast({ message: 'Payment failed: ' + (e?.message || String(e)), type: 'error' });
    }
  }, [order, universalAccount, ensureDelegated, signAndSend]);

  // Auto-pay: fire once when phase becomes READY
  const autoPayTriggered = useRef(false);
  useEffect(() => {
    if (phase === 'READY' && !autoPayTriggered.current) {
      autoPayTriggered.current = true;
      handlePay();
    }
  }, [phase, handlePay]);

  const amountUsd = order ? (Number(order.amount) / 1e6).toFixed(2) : '0.00';
  const remaining = order ? Math.max(0, Number(order.expiresAt) - now) : 0;
  const remainingLabel = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const progressPct = order ? Math.min(100, Math.max(0, ((ORDER_LIFESPAN - remaining) / ORDER_LIFESPAN) * 100)) : 0;

  const handleLogout = useCallback(async () => {
    try {
      if (magic) await magic.user.logout();
    } catch (e) {
      console.warn('magic logout failed', e);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginMethod');
    setToken('');
  }, [magic]);

  const handleCopyAddress = useCallback(async () => {
    if (!accountInfo.ownerAddress) return;
    try {
      await navigator.clipboard.writeText(accountInfo.ownerAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Clipboard API blocked (insecure context, permissions); fall back to a transient prompt.
      console.warn('clipboard write failed', e);
      window.prompt('Copy address:', accountInfo.ownerAddress);
    }
  }, [accountInfo.ownerAddress]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#28A0F0' }}>
            TapPay
          </h1>
        </div>

        {token && accountInfo.ownerAddress && (
          <div
            className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3"
            style={{ background: '#141419', border: '1px solid #2a2a36' }}
          >
            <button
              onClick={handleCopyAddress}
              className="flex flex-col min-w-0 items-start text-left group"
              title="Click to copy"
            >
              <span className="text-text-muted text-[10px] uppercase tracking-wider">Your account</span>
              <span className="text-text-primary text-xs font-mono mt-0.5 flex items-center gap-1.5">
                <span>{shorten(accountInfo.ownerAddress)}</span>
                {copied ? (
                  <span className="text-[10px] font-sans" style={{ color: '#22c55e' }}>Copied</span>
                ) : (
                  <CopyIcon />
                )}
              </span>
            </button>
            <button
              onClick={handleLogout}
              className="shrink-0 text-xs px-2.5 py-1 rounded-md"
              style={{ background: '#1f1f28', color: '#9ca3af', border: '1px solid #2a2a36' }}
            >
              Log out
            </button>
          </div>
        )}

        <Card>
          {phase === 'LOADING' && <Message label="Reading order..." spinner />}

          {phase === 'INVALID_LINK' && (
            <Message label="Invalid payment link" tone="error" hint="Ask the merchant to tap again." />
          )}

          {phase === 'NEEDS_LOGIN' && (
            <div className="flex flex-col gap-3">
              <p className="text-text-secondary text-sm">Sign in to pay</p>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  if (emailError) setEmailError(false);
                  setEmail(e.target.value);
                }}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-light text-text-primary text-sm outline-none"
                style={{ border: `1px solid ${emailError ? '#ef4444' : '#2a2a36'}` }}
              />
              {emailError && <span className="text-xs" style={{ color: '#ef4444' }}>Enter a valid email</span>}
              <button
                onClick={handleLogin}
                disabled={loggingIn || !magic || email.length === 0}
                className="w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ background: '#28A0F0' }}
              >
                {loggingIn ? <Spinner /> : 'Log in / Sign up'}
              </button>

              <div className="flex items-center gap-3 my-1">
                <span className="flex-1 h-px" style={{ background: '#2a2a36' }} />
                <span className="text-text-muted text-xs">or</span>
                <span className="flex-1 h-px" style={{ background: '#2a2a36' }} />
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loggingIn || !magic}
                className="w-full py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: '#ffffff', color: '#1f2328' }}
              >
                <GoogleIcon />
                {loggingIn ? 'Redirecting…' : 'Continue with Google'}
              </button>
            </div>
          )}

          {phase === 'NO_ORDER' && (
            <Message label="No pending order" tone="warning" hint="Ask the merchant to create one." />
          )}

          {phase === 'EXPIRED' && (
            <Message label="Order expired" tone="error" hint="Ask the merchant to create a new order." />
          )}

          {phase === 'ALREADY_PAID' && (
            <Message label="Order already paid" tone="success" />
          )}

          {phase === 'CANCELLED' && (
            <Message label="Order cancelled" tone="warning" />
          )}

          {phase === 'ERROR' && (
            <Message
              label="Payment failed"
              tone="error"
              hint={payError || 'Please try again.'}
            >
              <button
                onClick={() => {
                  setPayError('');
                  setPaying(false);
                }}
                className="mt-4 w-full py-2.5 rounded-lg font-semibold text-white"
                style={{ background: '#28A0F0' }}
              >
                Try again
              </button>
            </Message>
          )}

          {(phase === 'READY' || phase === 'PAYING') && order && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <p className="text-text-secondary text-xs uppercase tracking-wider">Paying</p>
                <p className="text-4xl font-bold mt-1 text-text-primary">${amountUsd}</p>
                <p className="text-text-muted text-xs mt-2 font-mono break-all">
                  {shorten(merchant!)}
                </p>
              </div>

              <div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#2a2a36' }}>
                  <div
                    className="h-full transition-all"
                    style={{ width: `${progressPct}%`, background: '#28A0F0' }}
                  />
                </div>
                <p className="text-text-muted text-xs mt-2 text-center">
                  Order expires in {remainingLabel}
                </p>
              </div>

              <div className="flex flex-col items-center gap-2 py-2">
                <Spinner />
                <p className="text-text-muted text-xs text-center">
                  Processing payment…
                </p>
              </div>
            </div>
          )}

          {phase === 'PAID' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl text-white"
                style={{ background: '#22c55e' }}
              >
                ✓
              </div>
              <p className="text-lg font-semibold" style={{ color: '#22c55e' }}>Paid!</p>
              {txId && (
                <a
                  href={`https://universalx.app/activity/details?id=${txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono break-all"
                  style={{ color: '#28A0F0' }}
                >
                  View transaction
                </a>
              )}
            </div>
          )}
        </Card>

        <p className="text-center text-text-muted text-xs mt-6">
          Powered by Universal Account + Magic
        </p>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: '#141419', border: '1px solid #2a2a36' }}
    >
      {children}
    </div>
  );
}

function Message({
  label,
  hint,
  tone = 'default',
  spinner = false,
  children,
}: {
  label: string;
  hint?: string;
  tone?: 'default' | 'success' | 'error' | 'warning';
  spinner?: boolean;
  children?: React.ReactNode;
}) {
  const color =
    tone === 'success' ? '#22c55e' : tone === 'error' ? '#ef4444' : tone === 'warning' ? '#f59e0b' : '#f0f0f5';
  return (
    <div className="flex flex-col items-center text-center gap-2 py-2">
      {spinner && <Spinner />}
      <p className="text-base font-semibold" style={{ color }}>{label}</p>
      {hint && <p className="text-text-muted text-xs">{hint}</p>}
      {children}
    </div>
  );
}

function shorten(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: '#9ca3af' }}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
