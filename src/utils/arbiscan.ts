import { Interface, formatUnits } from 'ethers';
import { TAPAY_ABI, TAPAY_ADDRESS } from './contracts';

const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';
const ARBITRUM_CHAIN_ID = '42161';

// Event signatures (topic0)
const tapayInterface = new Interface(TAPAY_ABI);

export const EVENT_TOPICS = {
  OrderCreated: tapayInterface.getEvent('OrderCreated')!.topicHash,
  OrderPaid: tapayInterface.getEvent('OrderPaid')!.topicHash,
  OrderCancelled: tapayInterface.getEvent('OrderCancelled')!.topicHash,
} as const;

// ── Types ──────────────────────────────────────────────

export type OrderEvent = {
  eventName: 'OrderCreated' | 'OrderPaid' | 'OrderCancelled';
  orderId: string;
  merchant: string;
  buyer: string | null;
  amount: string | null;      // formatted USDC (e.g. "10.50")
  expiresAt: number | null;   // unix timestamp
  txHash: string;
  blockNumber: number;
  timestamp: number;          // unix timestamp
};

type ArbiscanLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
};

type ArbiscanResponse = {
  status: string;
  message: string;
  result: ArbiscanLog[];
};

// ── Helpers ────────────────────────────────────────────

/** Pad an address to 32 bytes for topic matching */
export function padAddress(address: string): string {
  return '0x' + address.toLowerCase().replace('0x', '').padStart(64, '0');
}

/** Decode a uint256 from hex (used for non-indexed params in data field) */
function decodeUint256(hex: string): bigint {
  return BigInt(hex);
}

/** Parse raw Arbiscan logs into OrderEvent[] */
export function parseLogs(logs: ArbiscanLog[], eventName: OrderEvent['eventName']): OrderEvent[] {
  return logs.map((log) => {
    // topic[0] = event signature
    // topic[1] = orderId (indexed)
    // topic[2] = merchant (indexed) for all events
    // topic[3] = buyer (indexed) for OrderPaid only
    const orderId = BigInt(log.topics[1]).toString();
    const merchant = '0x' + log.topics[2].slice(26);

    let buyer: string | null = null;
    let amount: string | null = null;
    let expiresAt: number | null = null;

    if (eventName === 'OrderPaid') {
      // topic[3] = buyer (indexed)
      buyer = log.topics[3] ? '0x' + log.topics[3].slice(26) : null;
      // data = uint256 amount
      amount = formatUnits(decodeUint256(log.data), 6);
    } else if (eventName === 'OrderCreated') {
      // data = uint256 amount ++ uint64 expiresAt (abi-encoded as two 32-byte words)
      const data = log.data.replace('0x', '');
      amount = formatUnits(BigInt('0x' + data.slice(0, 64)), 6);
      expiresAt = Number(BigInt('0x' + data.slice(64, 128)));
    }
    // OrderCancelled: no additional data

    return {
      eventName,
      orderId,
      merchant,
      buyer,
      amount,
      expiresAt,
      txHash: log.transactionHash,
      blockNumber: parseInt(log.blockNumber, 16),
      timestamp: parseInt(log.timeStamp, 16),
    };
  });
}

// ── API Calls ──────────────────────────────────────────

/**
 * Fetch events from Arbiscan Logs API.
 * topic1 = orderId, topic2 = merchant, topic3 = buyer
 */
async function fetchLogs(
  topic0: string,
  topicFilter: { topic: string; value: string },
  page: number,
  offset: number,
): Promise<ArbiscanLog[]> {
  const params = new URLSearchParams({
    chainid: ARBITRUM_CHAIN_ID,
    module: 'logs',
    action: 'getLogs',
    address: TAPAY_ADDRESS,
    topic0,
    [topicFilter.topic]: topicFilter.value,
    fromBlock: '0',
    toBlock: 'latest',
    page: String(page),
    offset: String(offset),
  });

  const res = await fetch(`${ETHERSCAN_V2_BASE}?${params.toString()}`);
  const data: ArbiscanResponse = await res.json();

  if (data.status !== '1') return [];
  return data.result;
}

/** Fetch OrderCreated events for a merchant */
export async function fetchOrderCreated(merchant: string, page = 1, offset = 100) {
  const logs = await fetchLogs(EVENT_TOPICS.OrderCreated, { topic: 'topic2', value: padAddress(merchant) }, page, offset);
  return parseLogs(logs, 'OrderCreated');
}

/** Fetch OrderPaid events where user is merchant */
export async function fetchOrderPaidAsMerchant(merchant: string, page = 1, offset = 100) {
  const logs = await fetchLogs(EVENT_TOPICS.OrderPaid, { topic: 'topic2', value: padAddress(merchant) }, page, offset);
  return parseLogs(logs, 'OrderPaid');
}

/** Fetch OrderPaid events where user is buyer */
export async function fetchOrderPaidAsBuyer(buyer: string, page = 1, offset = 100) {
  const logs = await fetchLogs(EVENT_TOPICS.OrderPaid, { topic: 'topic3', value: padAddress(buyer) }, page, offset);
  return parseLogs(logs, 'OrderPaid');
}

/** Fetch OrderCancelled events for a merchant */
export async function fetchOrderCancelled(merchant: string, page = 1, offset = 100) {
  const logs = await fetchLogs(EVENT_TOPICS.OrderCancelled, { topic: 'topic2', value: padAddress(merchant) }, page, offset);
  return parseLogs(logs, 'OrderCancelled');
}

/** Fetch all events related to an address (merchant + buyer roles) */
export async function fetchAllEvents(address: string, page = 1, offset = 100): Promise<OrderEvent[]> {
  const [created, paidMerchant, paidBuyer, cancelled] = await Promise.all([
    fetchOrderCreated(address, page, offset),
    fetchOrderPaidAsMerchant(address, page, offset),
    fetchOrderPaidAsBuyer(address, page, offset),
    fetchOrderCancelled(address, page, offset),
  ]);

  // Merge, dedup by txHash+eventName, sort by timestamp desc
  const all = [...created, ...paidMerchant, ...paidBuyer, ...cancelled];
  const seen = new Set<string>();
  const deduped = all.filter((e) => {
    const key = `${e.txHash}-${e.eventName}-${e.orderId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.timestamp - a.timestamp);
  return deduped;
}
