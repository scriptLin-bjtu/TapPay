import { useState, useEffect, useCallback } from 'react';

interface TapPayTutorialModalProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'tappay_tutorial_dismissed_at';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const STEPS = [
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="8" y="14" width="32" height="22" rx="4" stroke="#28A0F0" strokeWidth="2.5" />
        <circle cx="24" cy="25" r="4" stroke="#28A0F0" strokeWidth="2" />
        <path d="M8 20h32" stroke="#28A0F0" strokeWidth="2" opacity="0.4" />
      </svg>
    ),
    title: 'Deposit Assets',
    description: 'Fund your account with crypto — ETH, USDC, USDT, and more are supported.',
  },
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <path d="M12 36V20l12-8 12 8v16H12z" stroke="#28A0F0" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="20" y="28" width="8" height="8" rx="1" stroke="#28A0F0" strokeWidth="2" />
        <circle cx="24" cy="24" r="2" fill="#28A0F0" />
      </svg>
    ),
    title: 'Shop at TapPay Merchants',
    description: 'Visit any store that supports TapPay — look for the NFC tag at checkout.',
  },
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="14" y="8" width="20" height="32" rx="4" stroke="#28A0F0" strokeWidth="2.5" />
        <rect x="18" y="12" width="12" height="20" rx="2" stroke="#28A0F0" strokeWidth="1.5" opacity="0.5" />
        <path d="M24 36v2" stroke="#28A0F0" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20 18l4 4 4-4" stroke="#28A0F0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Tap to Pay',
    description: 'Unlock your phone and tap the merchant\'s NFC device — just like Apple Pay.',
  },
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="14" stroke="#22c55e" strokeWidth="2.5" />
        <path d="M17 24l5 5 9-10" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Auto-Paid!',
    description: 'Payment is sent automatically — no confirmation needed. Fast, secure, effortless.',
  },
];

export function shouldShowTutorial(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissedAt = localStorage.getItem(STORAGE_KEY);
  if (!dismissedAt) return true;
  return Date.now() - Number(dismissedAt) > SEVEN_DAYS_MS;
}

export default function TapPayTutorialModal({ open, onClose }: TapPayTutorialModalProps) {
  const [current, setCurrent] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrent(0);
      setDontShow(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (dontShow) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }
    onClose();
  }, [dontShow, onClose]);

  const handleNext = useCallback(() => {
    if (current < STEPS.length - 1) {
      setCurrent(current + 1);
    }
  }, [current]);

  const handlePrev = useCallback(() => {
    if (current > 0) {
      setCurrent(current - 1);
    }
  }, [current]);

  if (!open) return null;

  const step = STEPS[current];
  const isLast = current === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={handleClose}
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
          onClick={handleClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Title */}
        <h3 className="text-lg font-semibold text-text-primary mb-6 text-center">
          How to Use TapPay
        </h3>

        {/* Step content */}
        <div className="flex flex-col items-center text-center mb-6 min-h-[160px] justify-center">
          {/* Icon */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(40, 160, 240, 0.08)' }}
          >
            {step.icon}
          </div>

          {/* Step indicator */}
          <p className="text-text-muted text-xs mb-2">
            Step {current + 1} of {STEPS.length}
          </p>

          {/* Step title */}
          <h4 className="text-text-primary text-base font-semibold mb-2">
            {step.title}
          </h4>

          {/* Step description */}
          <p className="text-text-muted text-sm leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Dots indicator */}
        <div className="flex justify-center gap-2 mb-5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === current ? 24 : 8,
                height: 8,
                background: i === current ? '#28A0F0' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-3 mb-4">
          {!isLast ? (
            <>
              <button
                onClick={handlePrev}
                disabled={current === 0}
                className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#9ca3af',
                  border: '1px solid #2a2a36',
                }}
              >
                Back
              </button>
              <button
                onClick={handleNext}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all"
                style={{ background: '#28A0F0' }}
              >
                Next
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
              style={{ background: '#28A0F0' }}
            >
              Got it!
            </button>
          )}
        </div>

        {/* Don't show again checkbox */}
        <label className="flex items-center justify-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="w-4 h-4 rounded accent-[#28A0F0]"
          />
          <span className="text-text-muted text-xs">
            Don&apos;t show again for 7 days
          </span>
        </label>
      </div>
    </div>
  );
}
