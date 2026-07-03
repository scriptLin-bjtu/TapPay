import { useState } from 'react';
import Link from 'next/link';
import { SUPPORTED_TOKEN_TYPE } from '@particle-network/universal-account-sdk';
import { useUniversalAccount } from '@/hooks/UniversalAccountProvider';
import Spinner from '@/components/ui/Spinner';
import DepositModal from '@/components/DepositModal';
import WithdrawModal from '@/components/WithdrawModal';

const TOKEN_LABELS: Record<string, string> = {
  [SUPPORTED_TOKEN_TYPE.ETH]: 'ETH',
  [SUPPORTED_TOKEN_TYPE.USDC]: 'USDC',
  [SUPPORTED_TOKEN_TYPE.USDT]: 'USDT',
  [SUPPORTED_TOKEN_TYPE.BNB]: 'BNB',
  [SUPPORTED_TOKEN_TYPE.SOL]: 'SOL',
  [SUPPORTED_TOKEN_TYPE.BTC]: 'BTC',
};

const TOKEN_COLORS: Record<string, string> = {
  [SUPPORTED_TOKEN_TYPE.ETH]: '#627EEA',
  [SUPPORTED_TOKEN_TYPE.USDC]: '#2775CA',
  [SUPPORTED_TOKEN_TYPE.USDT]: '#26A17B',
  [SUPPORTED_TOKEN_TYPE.BNB]: '#F3BA2F',
  [SUPPORTED_TOKEN_TYPE.SOL]: '#9945FF',
  [SUPPORTED_TOKEN_TYPE.BTC]: '#F7931A',
};

export default function AccountPage() {
  const { accountInfo, primaryAssets, loading, refreshBalance } = useUniversalAccount();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const shorten = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Account</h1>
          {accountInfo.evmSmartAccount && (
            <p className="text-text-muted text-xs mt-2 font-mono">
              {shorten(accountInfo.evmSmartAccount)}
            </p>
          )}
        </div>

        {/* Balance Card */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{ background: '#141419', border: '1px solid #2a2a36' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text-secondary text-sm font-medium">Total Assets</h2>
            {loading && <Spinner />}
          </div>

          {primaryAssets ? (
            <>
              {/* Total USD Value */}
              <p className="text-3xl font-bold text-text-primary mb-6">
                ${primaryAssets.totalAmountInUSD.toFixed(2)}
              </p>

              {/* Asset List */}
              <div className="flex flex-col gap-3">
                {primaryAssets.assets
                  .filter((asset) => asset.amount > 0)
                  .sort((a, b) => b.amountInUSD - a.amountInUSD)
                  .map((asset) => (
                    <div
                      key={asset.tokenType}
                      className="flex items-center justify-between py-2 px-3 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.03)' }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: TOKEN_COLORS[asset.tokenType] || '#6851ff' }}
                        >
                          {TOKEN_LABELS[asset.tokenType]?.[0] || '?'}
                        </div>
                        <div>
                          <p className="text-text-primary text-sm font-medium">
                            {TOKEN_LABELS[asset.tokenType] || asset.tokenType}
                          </p>
                          <p className="text-text-muted text-xs">
                            ${asset.price.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-text-primary text-sm font-medium">
                          {asset.amount.toFixed(4)}
                        </p>
                        <p className="text-text-muted text-xs">
                          ${asset.amountInUSD.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}

                {primaryAssets.assets.filter((a) => a.amount > 0).length === 0 && (
                  <p className="text-text-muted text-sm text-center py-4">
                    No assets yet. Deposit to get started.
                  </p>
                )}
              </div>
            </>
          ) : (
            !loading && (
              <p className="text-text-muted text-sm text-center py-4">
                Connect wallet to view assets
              </p>
            )
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setDepositOpen(true)}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ background: '#28A0F0' }}
          >
            Deposit
          </button>
          <button
            onClick={() => setWithdrawOpen(true)}
            disabled={!primaryAssets}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#6851ff' }}
          >
            Withdraw
          </button>
        </div>

        {/* History Link */}
        <Link
          href="/history"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-medium text-sm transition-all mt-3"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid #2a2a36',
            color: '#9ca3af',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Order History
        </Link>

        {/* Refresh hint */}
        <p className="text-text-muted text-xs text-center mt-6">
          Balances update automatically &middot; Powered by Particle Universal Accounts
        </p>
      </div>

      {/* Modals */}
      <DepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        evmAddress={accountInfo.evmSmartAccount}
        solanaAddress={accountInfo.solanaSmartAccount}
      />
      <WithdrawModal
        open={withdrawOpen}
        onClose={() => {
          setWithdrawOpen(false);
          refreshBalance();
        }}
        assets={primaryAssets?.assets.filter((a) => a.amount > 0) || []}
      />
    </main>
  );
}
