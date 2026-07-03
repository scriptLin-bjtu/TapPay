import { useEffect, useRef } from 'react';

const steps = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    label: 'Sign In',
    desc: 'Email or Google — no wallet needed',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <circle cx="12" cy="18" r="1" />
      </svg>
    ),
    label: 'Tap NFC',
    desc: 'Tap the merchant\'s tag with your phone',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    label: 'Pay',
    desc: 'Your stablecoin pays — chain auto-selected',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    label: 'Done',
    desc: 'Merchant receives funds in seconds',
  },
];

export default function FlowSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const steps = entry.target.querySelectorAll('.flow-step');
            steps.forEach((step, i) => {
              setTimeout(() => {
                step.classList.add('visible');
              }, i * 150);
            });
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-center text-lg font-semibold text-white mb-12">
          How It Works
        </h2>

        <div ref={containerRef} className="flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-0">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="flow-step flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full border border-[#2a2a36] bg-[#141419] flex items-center justify-center text-xl mb-2 text-[#28A0F0]">
                  {step.icon}
                </div>
                <span className="text-xs font-semibold text-white">{step.label}</span>
                <span className="text-[11px] text-text-muted mt-0.5">{step.desc}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden sm:block w-16 h-px bg-[#2a2a36] mx-2 relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-[#2a2a36]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
