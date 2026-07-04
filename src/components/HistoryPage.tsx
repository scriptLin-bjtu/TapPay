import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useUniversalAccount } from '@/hooks/UniversalAccountProvider';
import {
  EVENT_TOPICS,
  padAddress,
  parseLogs,
  type OrderEvent,
} from '@/utils/arbiscan';
import Spinner from '@/components/ui/Spinner';

// ── Constants ──────────────────────────────────────────

const PAGE_SIZE = 20;
const ARBISCAN_TX = 'https://arbiscan.io/tx/';
const ARBISCAN_ADDR = 'https://arbiscan.io/address/';

type ViewTab = 'buyer' | 'merchant';

// ── Component ──────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();
  const { accountInfo } = useUniversalAccount();
  const userAddress = accountInfo?.ownerAddress ?? (typeof window !== 'undefined' ? localStorage.getItem('user') : null);

  // ── Orders state ──
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('merchant');
  const [currentPage, setCurrentPage] = useState(1);

  // ── Fetch Orders from API route ──

  const fetchLogs = useCallback(async (topic0: string, topicFilter?: { topic: string; value: string }) => {
    const params = new URLSearchParams({ topic0, page: '1', offset: '500' });
    if (topicFilter) params.set(topicFilter.topic, topicFilter.value);

    const res = await fetch(`/api/history?${params.toString()}`);
    const data = await res.json();
    if (data.status !== '1') return [];
    return data.result;
  }, []);

  const loadEvents = useCallback(async () => {
    if (!userAddress) return;
    setLoading(true);
    setError('');

    try {
      const addr = padAddress(userAddress);

      const [createdLogs, paidMerchantLogs, paidBuyerLogs, cancelledLogs] = await Promise.all([
        fetchLogs(EVENT_TOPICS.OrderCreated, { topic: 'topic2', value: addr }),
        fetchLogs(EVENT_TOPICS.OrderPaid, { topic: 'topic2', value: addr }),
        fetchLogs(EVENT_TOPICS.OrderPaid, { topic: 'topic3', value: addr }),
        fetchLogs(EVENT_TOPICS.OrderCancelled, { topic: 'topic2', value: addr }),
      ]);

      const created = parseLogs(createdLogs, 'OrderCreated');
      const paidM = parseLogs(paidMerchantLogs, 'OrderPaid');
      const paidB = parseLogs(paidBuyerLogs, 'OrderPaid');
      const cancelled = parseLogs(cancelledLogs, 'OrderCancelled');

      const all = [...created, ...paidM, ...paidB, ...cancelled];
      const seen = new Set<string>();
      const deduped = all.filter((e) => {
        const key = `${e.txHash}-${e.eventName}-${e.orderId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => b.timestamp - a.timestamp);

      setEvents(deduped);
      setCurrentPage(1);
    } catch (err) {
      console.error('Failed to load events:', err);
      setError('Failed to load order history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userAddress, fetchLogs]);

  useEffect(() => {
    if (userAddress) loadEvents();
  }, [userAddress, loadEvents]);

  // ── Filtering & pagination ──

  const filtered = useMemo(() => {
    if (!userAddress) return [];
    const lower = userAddress.toLowerCase();

    if (activeTab === 'buyer') {
      // As Buyer: show OrderPaid where user is buyer
      return events.filter(
        (e) => e.eventName === 'OrderPaid' && e.buyer?.toLowerCase() === lower
      );
    } else {
      // As Merchant: show all events where user is merchant
      return events.filter(
        (e) => e.merchant.toLowerCase() === lower
      );
    }
  }, [events, activeTab, userAddress]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // ── Helpers ──

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const shortenAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const isExpired = (e: OrderEvent) => {
    if (e.eventName !== 'OrderCreated' || !e.expiresAt) return false;
    return Date.now() / 1000 > e.expiresAt;
  };

  const getStatusBadge = (e: OrderEvent) => {
    if (isExpired(e)) {
      return (
        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          Expired
        </span>
      );
    }

    const styles = {
      OrderCreated: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      OrderPaid: 'bg-green-500/20 text-green-400 border-green-500/30',
      OrderCancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const labels = { OrderCreated: 'Created', OrderPaid: 'Paid', OrderCancelled: 'Cancelled' };

    // Created状态可点击跳转到merchant页
    if (e.eventName === 'OrderCreated' && activeTab === 'merchant' && !isExpired(e)) {
      return (
        <button
          onClick={() => router.push(`/merchant?orderId=${e.orderId}`)}
          className="inline-block px-2 py-0.5 text-xs font-medium rounded border bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30 cursor-pointer transition-colors"
        >
          Created ↗
        </button>
      );
    }

    return (
      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${styles[e.eventName]}`}>
        {labels[e.eventName]}
      </span>
    );
  };

  // ── Main render ──

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">History</h1>

        {/* Tab切换 + Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* Tab 切换 */}
          <div className="flex items-center gap-1 bg-[#1a1a24] border border-[#2a2a36] rounded-lg p-1">
            <button
              onClick={() => setActiveTab('buyer')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === 'buyer'
                  ? 'bg-[#28A0F0] text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              As Buyer
            </button>
            <button
              onClick={() => setActiveTab('merchant')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === 'merchant'
                  ? 'bg-[#28A0F0] text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              As Merchant
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!loading && (
              <span className="text-sm text-gray-500">
                {filtered.length} order{filtered.length !== 1 ? 's' : ''}
              </span>
            )}

            {/* Refresh */}
            <button
              onClick={loadEvents}
              disabled={loading}
              className="px-3 py-2 text-sm bg-[#1a1a24] border border-[#2a2a36] rounded-lg hover:border-[#28A0F0] transition-colors disabled:opacity-50"
            >
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        )}

        {/* Table */}
        {!loading && paginated.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a2a36] text-left text-sm text-gray-400">
                  <th className="pb-3 pr-4">Order ID</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">{activeTab === 'buyer' ? 'Merchant' : 'Buyer'}</th>
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Tx</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((e) => (
                  <tr
                    key={`${e.txHash}-${e.eventName}-${e.orderId}`}
                    className="border-b border-[#1a1a24] hover:bg-[#141419] transition-colors"
                  >
                    <td className="py-3 pr-4 text-sm text-gray-300 font-mono">#{e.orderId}</td>
                    <td className="py-3 pr-4 text-sm">
                      {e.amount ? (
                        <span className="text-white font-medium">{e.amount} USDC</span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      {activeTab === 'buyer' ? (
                        // As Buyer: show merchant address
                        <a
                          href={`${ARBISCAN_ADDR}${e.merchant}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#28A0F0] hover:underline font-mono cursor-pointer"
                        >
                          {shortenAddr(e.merchant)}
                        </a>
                      ) : (
                        // As Merchant: show buyer address (only for OrderPaid)
                        e.buyer ? (
                          <a
                            href={`${ARBISCAN_ADDR}${e.buyer}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#28A0F0] hover:underline font-mono cursor-pointer"
                          >
                            {shortenAddr(e.buyer)}
                          </a>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )
                      )}
                    </td>
                    <td className="py-3 pr-4 text-sm text-gray-400">{formatTime(e.timestamp)}</td>
                    <td className="py-3 pr-4">
                      {e.txHash ? (
                        <a
                          href={`${ARBISCAN_TX}${e.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#28A0F0] hover:underline cursor-pointer"
                        >
                          {e.txHash.slice(0, 8)}…↗
                        </a>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {getStatusBadge(e)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!loading && paginated.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-2">No orders found</p>
            <p className="text-gray-500 text-sm">
              {activeTab === 'buyer'
                ? 'No paid orders as buyer yet.'
                : 'No orders created yet.'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm bg-[#1a1a24] border border-[#2a2a36] rounded hover:border-[#28A0F0] transition-colors disabled:opacity-30"
            >
              ← Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-gray-500">…</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      p === currentPage
                        ? 'bg-[#28A0F0] text-white'
                        : 'bg-[#1a1a24] border border-[#2a2a36] hover:border-[#28A0F0]'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm bg-[#1a1a24] border border-[#2a2a36] rounded hover:border-[#28A0F0] transition-colors disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
