import { Contract, Interface, JsonRpcProvider } from 'ethers';

export const TAPAY_ADDRESS = process.env.NEXT_PUBLIC_TAPAY_CONTRACT as string;
export const ARB_USDC = process.env.NEXT_PUBLIC_ARB_USDC as string;
export const ARB_RPC_URL = process.env.NEXT_PUBLIC_ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc';

export const TAPAY_ABI = [
  'function orders(uint256 orderId) view returns (address merchant, uint256 amount, uint64 expiresAt, uint8 status)',
  'function getLatestOrder(address merchant) view returns (uint256 orderId, tuple(address merchant, uint256 amount, uint64 expiresAt, uint8 status) order)',
  'function createOrder(uint256 amount) returns (uint256 orderId)',
  'function pay(uint256 orderId)',
  'function cancelOrder(uint256 orderId)',
  'event OrderCreated(uint256 indexed orderId, address indexed merchant, uint256 amount, uint64 expiresAt)',
  'event OrderPaid(uint256 indexed orderId, address indexed merchant, address indexed buyer, uint256 amount)',
  'event OrderCancelled(uint256 indexed orderId, address indexed merchant)',
] as const;

export const USDC_ABI = ['function approve(address spender, uint256 amount) returns (bool)'] as const;

// OrderStatus enum in TapPay.sol
export enum OrderStatus {
  OPEN = 0,
  PAID = 1,
  CANCELLED = 2,
}

export type LatestOrder = {
  orderId: bigint;
  merchant: string;
  amount: bigint;
  expiresAt: bigint;
  status: OrderStatus;
};

const tapayInterface = new Interface(TAPAY_ABI);
const usdcInterface = new Interface(USDC_ABI);

let provider: JsonRpcProvider | null = null;
const getProvider = () => {
  if (!provider) provider = new JsonRpcProvider(ARB_RPC_URL, 42161);
  return provider;
};

export const readLatestOrder = async (merchant: string): Promise<LatestOrder> => {
  const contract = new Contract(TAPAY_ADDRESS, TAPAY_ABI, getProvider());
  const [orderId, order] = await contract.getLatestOrder(merchant);
  return {
    orderId: BigInt(orderId),
    merchant: order.merchant as string,
    amount: BigInt(order.amount),
    expiresAt: BigInt(order.expiresAt),
    status: Number(order.status) as OrderStatus,
  };
};

export const readOrder = async (orderId: bigint): Promise<LatestOrder> => {
  const contract = new Contract(TAPAY_ADDRESS, TAPAY_ABI, getProvider());
  const o = await contract.orders(orderId);
  return {
    orderId,
    merchant: o.merchant as string,
    amount: BigInt(o.amount),
    expiresAt: BigInt(o.expiresAt),
    status: Number(o.status) as OrderStatus,
  };
};

export const encodeApprove = (spender: string, amount: bigint): string =>
  usdcInterface.encodeFunctionData('approve', [spender, amount]);

export const encodePay = (orderId: bigint): string =>
  tapayInterface.encodeFunctionData('pay', [orderId]);

export const encodeCreateOrder = (amount: bigint): string =>
  tapayInterface.encodeFunctionData('createOrder', [amount]);

export const encodeCancelOrder = (orderId: bigint): string =>
  tapayInterface.encodeFunctionData('cancelOrder', [orderId]);

/**
 * Parse OrderCreated event from a transaction receipt to extract the orderId.
 * Returns null if the event is not found.
 */
export const parseOrderIdFromReceipt = (receipt: { logs: Array<{ topics: string[]; data: string }> }): bigint | null => {
  for (const log of receipt.logs) {
    try {
      const parsed = tapayInterface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === 'OrderCreated') {
        return BigInt(parsed.args.orderId.toString());
      }
    } catch {
      // not our event, skip
    }
  }
  return null;
};
