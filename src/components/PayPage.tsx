import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { isAddress, formatUnits } from 'ethers';
import {
  CHAIN_ID,
  SUPPORTED_TOKEN_TYPE,
} from '@particle-network/universal-account-sdk';
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
import showToast from '@/utils/showToast';
import Spinner from '@/components/ui/Spinner';

const ORDER_LIFESPAN = 300; // 5 minutes, matches TapPay.sol ORDER_LIFESPAN

type Phase =
  | 'LOADING'
  | 'INVALID_LINK'
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
  const { universalAccount, accountInfo, ensureDelegated, signAndSend } = useUniversalAccount();

  const [merchant, setMerchant] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<bigint | null>(null);
  const [order, setOrder] = useState<LatestOrder | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [txId, setTxId] = useState('');
  const [payError, setPayError] = useState('');

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
    if (!order) return 'LOADING';
    if (order.orderId === 0n) return 'NO_ORDER';
    if (order.status === OrderStatus.PAID) return 'ALREADY_PAID';
    if (order.status === OrderStatus.CANCELLED) return 'CANCELLED';
    if (order.status !== OrderStatus.OPEN) return 'CANCELLED';
    if (now > order.expiresAt) return 'EXPIRED';
    return 'READY';
  }, [paid, paying, merchant, orderId, order, now]);

  const handlePay = useCallback(async () => {
    if (!order || !universalAccount) return;
    setPaying(true);
    setPayError('');
    try {
      await ensureDelegated();
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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#28A0F0' }}>
            TapPay
          </h1>
        </div>

        <Card>
          {phase === 'LOADING' && <Message label="Reading order..." spinner />}

          {phase === 'INVALID_LINK' && (
            <Message label="Invalid payment link" tone="error" hint="Ask the merchant to tap again." />
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
                  Processing payment...
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
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;
}
