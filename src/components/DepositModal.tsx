import { useCallback, useState } from 'react';

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  address: string;
}

export default function DepositModal({ open, onClose, address }: DepositModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy address:', address);
    }
  }, [address]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl p-6"
        style={{ background: '#141419', border: '1px solid #2a2a36' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <h3 className="text-lg font-semibold text-text-primary mb-1">Deposit</h3>
        <p className="text-text-muted text-xs mb-6">
          Send assets to this address from any wallet or exchange
        </p>

        {/* Address display */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a36' }}
        >
          <p className="text-text-secondary text-xs mb-2">Universal Account Address</p>
          <p className="text-text-primary text-sm font-mono break-all leading-relaxed">
            {address || 'Loading...'}
          </p>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          disabled={!address}
          className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-40"
          style={{ background: copied ? '#22c55e' : '#28A0F0' }}
        >
          {copied ? 'Copied!' : 'Copy Address'}
        </button>

        {/* Supported chains note */}
        <p className="text-text-muted text-xs text-center mt-4">
          Supports Ethereum, Arbitrum, Base, BSC, Solana & more
        </p>
      </div>
    </div>
  );
}
