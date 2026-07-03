import { useCallback, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  evmAddress: string;
  solanaAddress: string;
}

type ActiveTab = 'evm' | 'solana';

export default function DepositModal({ open, onClose, evmAddress, solanaAddress }: DepositModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('evm');

  const activeAddress = activeTab === 'evm' ? evmAddress : solanaAddress;

  const handleCopy = useCallback(async () => {
    if (!activeAddress) return;
    try {
      await navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy address:', activeAddress);
    }
  }, [activeAddress]);

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
        <p className="text-text-muted text-xs mb-4">
          Send assets to this address from any wallet or exchange
        </p>

        {/* Tab switcher */}
        <div
          className="flex rounded-xl p-1 mb-5"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <button
            onClick={() => { setActiveTab('evm'); setCopied(false); }}
            className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: activeTab === 'evm' ? '#28A0F0' : 'transparent',
              color: activeTab === 'evm' ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
          >
            EVM (ETH/ARB/BASE)
          </button>
          <button
            onClick={() => { setActiveTab('solana'); setCopied(false); }}
            className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: activeTab === 'solana' ? '#9945FF' : 'transparent',
              color: activeTab === 'solana' ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
          >
            Solana
          </button>
        </div>

        {/* QR Code */}
        {activeAddress ? (
          <div className="flex justify-center mb-4">
            <div
              className="rounded-xl p-4"
              style={{ background: '#fff' }}
            >
              <QRCodeSVG
                value={activeAddress}
                size={180}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-4">
            <div
              className="w-[216px] h-[216px] rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <p className="text-text-muted text-sm">Loading...</p>
            </div>
          </div>
        )}

        {/* Address display */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a36' }}
        >
          <p className="text-text-secondary text-xs mb-2">
            {activeTab === 'evm' ? 'EVM Universal Account' : 'Solana Universal Account'}
          </p>
          <p className="text-text-primary text-sm font-mono break-all leading-relaxed">
            {activeAddress || 'Loading...'}
          </p>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          disabled={!activeAddress}
          className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-40"
          style={{ background: copied ? '#22c55e' : activeTab === 'solana' ? '#9945FF' : '#28A0F0' }}
        >
          {copied ? 'Copied!' : `Copy ${activeTab === 'evm' ? 'EVM' : 'Solana'} Address`}
        </button>

        {/* Supported chains note */}
        <p className="text-text-muted text-xs text-center mt-4">
          Same address works for Ethereum, Arbitrum, Base, BSC & more
        </p>
      </div>
    </div>
  );
}
