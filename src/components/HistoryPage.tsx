import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type EventFilter = 'ALL' | 'OrderCreated' | 'OrderPaid' | 'OrderCancelled';

// ── Component ──────────────────────────────────────────

export default function HistoryPage() {
  const { accountInfo, loading: uaLoading } = useUniversalAccount();
  const userAddress = accountInfo?.ownerAddress ?? (typeof window !== 'undefined' ? localStorage.getItem('user') : null);

  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<EventFilter>('ALL');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Fetch events from API route ──

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

      // 4 parallel queries: created, paid-as-merchant, paid-as-buyer, cancelled
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

      // Merge, dedup, sort
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
    if (filter === 'ALL') return events;
    return events.filter((e) => e.eventName === filter);
  }, [events, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const filterOptions: { value: EventFilter; label: string }[] = [
    { value: 'ALL', label: 'All Events' },
    { value: 'OrderCreated', label: 'Created' },
    { value: 'OrderPaid', label: 'Paid' },
    { value: 'OrderCancelled', label: 'Cancelled' },
  ];
  const currentFilterLabel = filterOptions.find((o) => o.value === filter)?.label ?? 'All Events';

  const isExpired = (e: OrderEvent) => {
    if (e.eventName !== 'OrderCreated' || !e.expiresAt) return false;
    return Date.now() / 1000 > e.expiresAt;
  };

  const getEventBadge = (e: OrderEvent) => {
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
    return (
      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${styles[e.eventName]}`}>
        {labels[e.eventName]}
      </span>
    );
  };

  const getCounterparty = (e: OrderEvent) => {
    if (!userAddress) return null;
    const lower = userAddress.toLowerCase();
    if (e.eventName === 'OrderPaid') {
      // If I'm the merchant, show buyer; if I'm the buyer, show merchant
      if (e.merchant.toLowerCase() === lower) return e.buyer;
      return e.merchant;
    }
    // Created / Cancelled — always show merchant (which is the user)
    return e.merchant;
  };

  const getRole = (e: OrderEvent) => {
    if (!userAddress || e.eventName !== 'OrderPaid') return null;
    return e.merchant.toLowerCase() === userAddress.toLowerCase() ? 'Seller' : 'Buyer';
  };

  // ── Main render ──

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Orders</h1>
            {!loading && (
              <span className="text-sm text-gray-500">
                {filtered.length} event{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Filter dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 bg-[#1a1a24] border border-[#2a2a36] rounded-lg pl-3 pr-2 py-2 text-sm text-gray-200 hover:border-[#3a3a46] focus:outline-none focus:border-[#28A0F0] transition-colors"
              >
                <span>{currentFilterLabel}</span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-[#1a1a24] border border-[#2a2a36] rounded-lg shadow-lg overflow-hidden z-50">
                  {filterOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setFilter(opt.value);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        filter === opt.value
                          ? 'bg-[#28A0F0]/15 text-[#28A0F0]'
                          : 'text-gray-300 hover:bg-[#22222e]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
                  <th className="pb-3 pr-4">Event</th>
                  <th className="pb-3 pr-4">Order</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Counterparty</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((e) => {
                  const cp = getCounterparty(e);
                  const role = getRole(e);
                  return (
                    <tr
                      key={`${e.txHash}-${e.eventName}-${e.orderId}`}
                      className="border-b border-[#1a1a24] hover:bg-[#141419] transition-colors"
                    >
                      <td className="py-3 pr-4">{getEventBadge(e)}</td>
                      <td className="py-3 pr-4 text-sm text-gray-300 font-mono">#{e.orderId}</td>
                      <td className="py-3 pr-4 text-sm">
                        {e.amount ? (
                          <span className="text-white font-medium">{e.amount} USDC</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-sm">
                        {cp ? (
                          <a
                            href={`${ARBISCAN_ADDR}${cp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#28A0F0] hover:underline font-mono cursor-pointer"
                          >
                            {shortenAddr(cp)}
                          </a>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-sm">
                        {role ? (
                          <span className={role === 'Seller' ? 'text-green-400' : 'text-blue-400'}>
                            {role}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-400">{formatTime(e.timestamp)}</td>
                      <td className="py-3">
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state (after loading) */}
        {!loading && paginated.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-2">No order events found</p>
            <p className="text-gray-500 text-sm">
              {filter !== 'ALL'
                ? 'Try changing the filter to see more events.'
                : 'Create or pay an order to see history here.'}
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
