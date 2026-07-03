import type { NextApiRequest, NextApiResponse } from 'next';
import { execSync } from 'child_process';

const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';
const API_KEY = process.env.ETHERSCAN_API_KEY || process.env.ARBISCAN_API_KEY || '';

/**
 * Proxy to Etherscan V2 Logs API (Arbitrum chainid=42161).
 * Uses curl under the hood to respect system proxy settings.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic0, topic1, topic2, topic3, page = '1', offset = '100', address: customAddress } = req.query;

  if (!topic0) {
    return res.status(400).json({ error: 'topic0 is required' });
  }

  // 允许通过 query 参数自定义 address，否则使用默认的 TapPay 合约地址
  const contractAddress = (customAddress as string) || process.env.NEXT_PUBLIC_TAPAY_CONTRACT;
  if (!contractAddress) {
    return res.status(500).json({ error: 'Contract address not configured' });
  }

  const params = new URLSearchParams({
    chainid: '42161',
    module: 'logs',
    action: 'getLogs',
    address: contractAddress,
    topic0: topic0 as string,
    fromBlock: '0',
    toBlock: 'latest',
    page: page as string,
    offset: offset as string,
    ...(API_KEY && { apikey: API_KEY }),
  });

  if (topic1) params.set('topic1', topic1 as string);
  if (topic2) params.set('topic2', topic2 as string);
  if (topic3) params.set('topic3', topic3 as string);

  const url = `${ETHERSCAN_V2_BASE}?${params.toString()}`;

  try {
    const body = execSync(`curl -s "${url}"`, {
      timeout: 15000,
      encoding: 'utf-8',
      env: { ...process.env },
    });
    const data = JSON.parse(body);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[history] Etherscan API error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to fetch from Etherscan', detail: error?.message });
  }
}
