import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { formatUnits, parseUnits } from 'ethers';
import { CHAIN_ID, SUPPORTED_TOKEN_TYPE } from '@particle-network/universal-account-sdk';
import { useUniversalAccount } from '@/hooks/UniversalAccountProvider';
import {
  TAPAY_ADDRESS,
  OrderStatus,
  readOrder,
  encodeCreateOrder,
  encodeCancelOrder,
  type LatestOrder,
} from '@/utils/contracts';
import showToast from '@/utils/showToast';
import Spinner from '@/components/ui/Spinner';

const ORDER_LIFESPAN = 300; // 5 minutes

type Phase = 'IDLE' | 'CREATING' | 'ORDER_ACTIVE' | 'ORDER_PAID' | 'ORDER_EXPIRED' | 'ORDER_CANCELLED';

export default function MerchantDashboard() {
  const router = useRouter();
  const { universalAccount, accountInfo, ensureDelegated, signAndSend } = useUniversalAccount();

  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState('');
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<'create' | 'cancel'>('create');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const [activeOrderId, setActiveOrderId] = useState<bigint | null>(null);
  const [order, setOrder] = useState<LatestOrder | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [nfcWriting, setNfcWriting] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);

  // Check NFC support
  useEffect(() => {
    const supported = 'NDEFWriter' in window || 'NDEFReader' in window;
    setNfcSupported(supported);
  }, []);

  // Resume order from URL query parameter (only once on mount)
  const resumedRef = useRef(false);
  useEffect(() => {
    const orderId = router.query.orderId;
    if (orderId && typeof orderId === 'string' && !resumedRef.current) {
      resumedRef.current = true;
      const resumeOrder = async () => {
        try {
          const id = BigInt(orderId);
          setActiveOrderId(id);
          const orderData = await readOrder(id);
          setOrder(orderData);
          showToast({ message: `Resumed order #${orderId}`, type: 'success' });
        } catch (e) {
          console.error('Failed to resume order:', e);
          showToast({ message: 'Failed to resume order', type: 'error' });
        }
      };
      resumeOrder();
    }
  }, [router.query.orderId]);

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
    if (creating) return 'CREATING';
    if (!activeOrderId) return 'IDLE';
    if (!order) return 'CREATING';
    if (order.status === OrderStatus.PAID) return 'ORDER_PAID';
    if (order.status === OrderStatus.CANCELLED) return 'ORDER_CANCELLED';
    if (now > order.expiresAt) return 'ORDER_EXPIRED';
    return 'ORDER_ACTIVE';
  }, [creating, activeOrderId, order, now]);

  // Create order
  const handleCreateOrder = useCallback(async () => {
    if (!universalAccount || !amountInput) return;

    const parsed = parseFloat(amountInput);
    if (isNaN(parsed) || parsed <= 0) {
      setAmountError('Enter a valid amount');
      return;
    }

    setCreating(true);
    setAction('create');
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

      const merchantAddr = accountInfo.ownerAddress;
      if (!merchantAddr) throw new Error('Merchant address not found');

      // Wait for the transaction to be mined, then fetch latest order
      await new Promise((r) => setTimeout(r, 3000));

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

  // Cancel order
  const handleCancelOrder = useCallback(() => {
    if (!universalAccount || !activeOrderId) return;
    setShowCancelConfirm(true);
  }, [universalAccount, activeOrderId]);

  const confirmCancelOrder = useCallback(async () => {
    setShowCancelConfirm(false);
    setCreating(true);
    setAction('cancel');
    try {
      await ensureDelegated();

      const tx = await universalAccount.createUniversalTransaction({
        chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE,
        expectTokens: [],
        transactions: [
          { to: TAPAY_ADDRESS, data: encodeCancelOrder(activeOrderId), value: '0' },
        ],
      });

      await signAndSend(tx);

      // Wait for the transaction to be mined, then refetch order
      await new Promise((r) => setTimeout(r, 3000));

      const updated = await readOrder(activeOrderId);
      setOrder(updated);
      showToast({ message: 'Order cancelled!', type: 'success' });
    } catch (e: any) {
      console.error('cancel order failed', e);
      showToast({ message: 'Failed to cancel order: ' + (e?.message || String(e)), type: 'error' });
    } finally {
      setCreating(false);
    }
  }, [universalAccount, activeOrderId, ensureDelegated, signAndSend]);

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

        <Card>
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
              <p className="text-text-muted text-xs">
                {action === 'cancel' ? 'Cancelling order...' : 'Creating order on-chain...'}
              </p>
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

              {/* Cancel button */}
              <button
                onClick={handleCancelOrder}
                className="w-full py-2 text-xs rounded-lg transition-colors"
                style={{ color: '#9ca3af', background: 'transparent', border: '1px solid #2a2a36' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a36'; e.currentTarget.style.color = '#9ca3af'; }}
              >
                Cancel Order
              </button>
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

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#1a1a24', border: '1px solid #2a2a36' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-2">Cancel Order?</h3>
            <p className="text-text-muted text-sm mb-6">
              This will cancel the order permanently. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: '#2a2a36', color: '#9ca3af' }}
              >
                Keep Order
              </button>
              <button
                onClick={confirmCancelOrder}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#ef4444' }}
              >
                Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
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
