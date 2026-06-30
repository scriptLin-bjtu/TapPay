import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { isAddress, formatUnits, parseUnits } from 'ethers';
import { CHAIN_ID, SUPPORTED_TOKEN_TYPE } from '@particle-network/universal-account-sdk';
import { useMagic } from '@/hooks/MagicProvider';
import { useUniversalAccount } from '@/hooks/UniversalAccountProvider';
import {
  TAPAY_ADDRESS,
  OrderStatus,
  readOrder,
  encodeCreateOrder,
  parseOrderIdFromReceipt,
  type LatestOrder,
} from '@/utils/contracts';
import { saveUserInfo } from '@/utils/common';
import showToast from '@/utils/showToast';
import Spinner from '@/components/ui/Spinner';

const ORDER_LIFESPAN = 300; // 5 minutes
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

type Phase = 'LOGIN' | 'IDLE' | 'CREATING' | 'ORDER_ACTIVE' | 'ORDER_PAID' | 'ORDER_EXPIRED' | 'ORDER_CANCELLED';

export default function MerchantDashboard() {
  const { magic } = useMagic();
  const { universalAccount, accountInfo, ensureDelegated, signAndSend } = useUniversalAccount();

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState('');
  const [creating, setCreating] = useState(false);

  const [activeOrderId, setActiveOrderId] = useState<bigint | null>(null);
  const [order, setOrder] = useState<LatestOrder | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [nfcWriting, setNfcWriting] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);

  // Check token on mount
  useEffect(() => {
    setToken(localStorage.getItem('token') ?? '');
  }, []);

  // Check NFC support (NDEFWriter in newer Chrome, NDEFReader in older)
  useEffect(() => {
    const supported = 'NDEFWriter' in window || 'NDEFReader' in window;
    setNfcSupported(supported);
  }, []);

  // Handle OAuth redirect callback
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
        }
      })
      .catch((e) => {
        const msg = e?.message || '';
        const code = e?.code || '';
        const benign =
          /empty|no result|parse|pkce|metadata|session/i.test(msg) ||
          /PKCE|METADATA/i.test(code);
        if (!benign) console.error('oauth redirect result error', e);
      });
    return () => { active = false; };
  }, [magic]);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll active order
  useEffect(() => {
    if (!activeOrderId) return;
    let alive = true;
    const fetchOnce = async () => {
      try {
        const o = await readOrder(activeOrderId);
        if (!alive) return;
        setOrder(o);
      } catch (e) {
        console.error('fetch order failed', e);
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [activeOrderId]);

  const phase = useMemo<Phase>(() => {
    if (!token) return 'LOGIN';
    if (creating) return 'CREATING';
    if (!activeOrderId) return 'IDLE';
    if (!order) return 'CREATING';
    if (order.status === OrderStatus.PAID) return 'ORDER_PAID';
    if (order.status === OrderStatus.CANCELLED) return 'ORDER_CANCELLED';
    if (now > order.expiresAt) return 'ORDER_EXPIRED';
    return 'ORDER_ACTIVE';
  }, [token, creating, activeOrderId, order, now]);

  // Login handlers
  const handleEmailLogin = useCallback(async () => {
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

  const handleGoogleLogin = useCallback(async () => {
    if (!magic) return;
    setLoggingIn(true);
    try {
      await magic.oauth2.loginWithRedirect({
        provider: 'google',
        redirectURI: window.location.origin + '/merchant',
      });
    } catch (e: any) {
      console.error('google login error:', e);
      showToast({ message: 'Google login failed: ' + (e?.message || String(e)), type: 'error' });
      setLoggingIn(false);
    }
  }, [magic]);

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
    setActiveOrderId(null);
    setOrder(null);
  }, [magic]);

  // Create order
  const handleCreateOrder = useCallback(async () => {
    if (!universalAccount || !amountInput) return;

    const parsed = parseFloat(amountInput);
    if (isNaN(parsed) || parsed <= 0) {
      setAmountError('Enter a valid amount');
      return;
    }

    setCreating(true);
    setAmountError('');
    try {
      const amountRaw = parseUnits(amountInput, 6); // USDC 6 decimals
      await ensureDelegated();

      const tx = await universalAccount.createUniversalTransaction({
        chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE,
        expectTokens: [{ type: SUPPORTED_TOKEN_TYPE.USDC, amount: amountInput }],
        transactions: [
          { to: TAPAY_ADDRESS, data: encodeCreateOrder(amountRaw), value: '0' },
        ],
      });

      const result = await signAndSend(tx);

      // We need to get the orderId. Since UA sends via a relayer, we don't have
      // a direct receipt. We'll fetch the latest order for this merchant.
      const merchantAddr = accountInfo.ownerAddress;
      if (!merchantAddr) throw new Error('Merchant address not found');

      // Wait a moment for the transaction to be mined, then fetch latest order
      await new Promise((r) => setTimeout(r, 3000));

      // Import readLatestOrder
      const { readLatestOrder } = await import('@/utils/contracts');
      const latest = await readLatestOrder(merchantAddr);
      setActiveOrderId(latest.orderId);
      setOrder(latest);
      setAmountInput('');
      showToast({ message: 'Order created!', type: 'success' });
    } catch (e: any) {
      console.error('create order failed', e);
      showToast({ message: 'Failed to create order: ' + (e?.message || String(e)), type: 'error' });
    } finally {
      setCreating(false);
    }
  }, [universalAccount, amountInput, ensureDelegated, signAndSend, accountInfo.ownerAddress]);

  // Write NFC
  const paymentUrl = useMemo(() => {
    if (!activeOrderId || !accountInfo.ownerAddress) return '';
    return `${window.location.origin}/pay?m=${accountInfo.ownerAddress}&o=${activeOrderId.toString()}`;
  }, [activeOrderId, accountInfo.ownerAddress]);

  const handleWriteNfc = useCallback(async () => {
    if (!paymentUrl || !nfcSupported) return;
    setNfcWriting(true);
    try {
      const NDEFClass = (window as any).NDEFWriter || (window as any).NDEFReader;
      const ndef = new NDEFClass();
      await ndef.write({
        records: [{ recordType: 'url', data: paymentUrl }],
      });
      showToast({ message: 'NFC tag written!', type: 'success' });
    } catch (e: any) {
      console.error('NFC write failed', e);
      showToast({ message: 'NFC write failed: ' + (e?.message || String(e)), type: 'error' });
    } finally {
      setNfcWriting(false);
    }
  }, [paymentUrl, nfcSupported]);

  // Copy payment URL
  const [copied, setCopied] = useState(false);
  const handleCopyUrl = useCallback(async () => {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy URL:', paymentUrl);
    }
  }, [paymentUrl]);

  // Reset to create new order
  const handleNewOrder = useCallback(() => {
    setActiveOrderId(null);
    setOrder(null);
  }, []);

  // Computed values
  const amountUsd = order ? (Number(order.amount) / 1e6).toFixed(2) : '0.00';
  const remaining = order ? Math.max(0, Number(order.expiresAt) - now) : 0;
  const remainingLabel = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const progressPct = order ? Math.min(100, Math.max(0, ((ORDER_LIFESPAN - remaining) / ORDER_LIFESPAN) * 100)) : 0;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#28A0F0' }}>
            TapPay Merchant
          </h1>
        </div>

        {/* Account info bar */}
        {token && accountInfo.ownerAddress && (
          <div
            className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3"
            style={{ background: '#141419', border: '1px solid #2a2a36' }}
          >
            <div className="flex flex-col min-w-0 items-start">
              <span className="text-text-muted text-[10px] uppercase tracking-wider">Merchant</span>
              <span className="text-text-primary text-xs font-mono mt-0.5">
                {shorten(accountInfo.ownerAddress)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/history"
                className="shrink-0 text-xs px-2.5 py-1 rounded-md hover:text-[#28A0F0] transition-colors"
                style={{ background: '#1f1f28', color: '#9ca3af', border: '1px solid #2a2a36' }}
              >
                History
              </Link>
              <button
                onClick={handleLogout}
                className="shrink-0 text-xs px-2.5 py-1 rounded-md"
                style={{ background: '#1f1f28', color: '#9ca3af', border: '1px solid #2a2a36' }}
              >
                Log out
              </button>
            </div>
          </div>
        )}

        <Card>
          {/* LOGIN */}
          {phase === 'LOGIN' && (
            <div className="flex flex-col gap-3">
              <p className="text-text-secondary text-sm">Sign in as merchant</p>
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
                onClick={handleEmailLogin}
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
                {loggingIn ? 'Redirecting...' : 'Continue with Google'}
              </button>
            </div>
          )}

          {/* IDLE - Create order form */}
          {phase === 'IDLE' && (
            <div className="flex flex-col gap-4">
              <p className="text-text-secondary text-sm">Create a new payment order</p>
              <div>
                <label className="text-text-muted text-xs mb-1.5 block">Amount (USDC)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={amountInput}
                  onChange={(e) => {
                    if (amountError) setAmountError('');
                    setAmountInput(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-light text-text-primary text-sm outline-none"
                  style={{ border: `1px solid ${amountError ? '#ef4444' : '#2a2a36'}` }}
                />
                {amountError && <span className="text-xs mt-1 block" style={{ color: '#ef4444' }}>{amountError}</span>}
              </div>
              <button
                onClick={handleCreateOrder}
                disabled={creating || !universalAccount || !amountInput}
                className="w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ background: '#28A0F0' }}
              >
                {creating ? <Spinner /> : 'Create Order'}
              </button>
            </div>
          )}

          {/* CREATING */}
          {phase === 'CREATING' && (
            <div className="flex flex-col items-center gap-2 py-4">
              <Spinner />
              <p className="text-text-muted text-xs">Creating order on-chain...</p>
            </div>
          )}

          {/* ORDER_ACTIVE */}
          {phase === 'ORDER_ACTIVE' && order && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <p className="text-text-secondary text-xs uppercase tracking-wider">Waiting for payment</p>
                <p className="text-4xl font-bold mt-1 text-text-primary">${amountUsd}</p>
                <p className="text-text-muted text-xs mt-2">Order #{order.orderId.toString()}</p>
              </div>

              <div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#2a2a36' }}>
                  <div
                    className="h-full transition-all"
                    style={{ width: `${progressPct}%`, background: '#28A0F0' }}
                  />
                </div>
                <p className="text-text-muted text-xs mt-2 text-center">
                  Expires in {remainingLabel}
                </p>
              </div>

              {/* Payment URL */}
              <div className="flex flex-col gap-2">
                <label className="text-text-muted text-xs">Payment URL</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={paymentUrl}
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-light text-text-secondary text-xs font-mono truncate outline-none"
                    style={{ border: '1px solid #2a2a36' }}
                  />
                  <button
                    onClick={handleCopyUrl}
                    className="shrink-0 text-xs px-3 py-2 rounded-lg"
                    style={{ background: '#1f1f28', color: copied ? '#22c55e' : '#9ca3af', border: '1px solid #2a2a36' }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* NFC Write button */}
              {nfcSupported ? (
                <button
                  onClick={handleWriteNfc}
                  disabled={nfcWriting}
                  className="w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
                  style={{ background: '#22c55e' }}
                >
                  {nfcWriting ? <Spinner /> : 'Write to NFC Tag'}
                </button>
              ) : (
                <p className="text-text-muted text-xs text-center">
                  NFC not available on this device. Use Android Chrome to write NFC tags.
                </p>
              )}

              {/* Spinner while waiting */}
              <div className="flex flex-col items-center gap-2 py-2">
                <Spinner />
                <p className="text-text-muted text-xs text-center">Waiting for customer payment...</p>
              </div>
            </div>
          )}

          {/* ORDER_PAID */}
          {phase === 'ORDER_PAID' && order && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl text-white"
                style={{ background: '#22c55e' }}
              >
                ✓
              </div>
              <p className="text-lg font-semibold" style={{ color: '#22c55e' }}>Payment Received!</p>
              <p className="text-text-primary text-2xl font-bold">${amountUsd}</p>
              <p className="text-text-muted text-xs">Order #{order.orderId.toString()}</p>
              <button
                onClick={handleNewOrder}
                className="mt-4 w-full py-2.5 rounded-lg font-semibold text-white"
                style={{ background: '#28A0F0' }}
              >
                Create New Order
              </button>
            </div>
          )}

          {/* ORDER_EXPIRED */}
          {phase === 'ORDER_EXPIRED' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-base font-semibold" style={{ color: '#f59e0b' }}>Order Expired</p>
              <p className="text-text-muted text-xs">The 5-minute payment window has passed.</p>
              <button
                onClick={handleNewOrder}
                className="mt-4 w-full py-2.5 rounded-lg font-semibold text-white"
                style={{ background: '#28A0F0' }}
              >
                Create New Order
              </button>
            </div>
          )}

          {/* ORDER_CANCELLED */}
          {phase === 'ORDER_CANCELLED' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-base font-semibold" style={{ color: '#ef4444' }}>Order Cancelled</p>
              <button
                onClick={handleNewOrder}
                className="mt-4 w-full py-2.5 rounded-lg font-semibold text-white"
                style={{ background: '#28A0F0' }}
              >
                Create New Order
              </button>
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

function shorten(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}
