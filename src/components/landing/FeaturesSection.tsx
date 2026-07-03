import { useScrollAnimationGroup } from '@/hooks/useScrollAnimation';

const features = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <circle cx="12" cy="18" r="1" />
      </svg>
    ),
    title: 'Tap to Pay',
    desc: 'One tap. No app download, no QR scan — just your phone',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    title: 'Any Stablecoin',
    desc: 'Pay with USDC or USDT on any chain — no network switching',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    title: 'No ETH Needed',
    desc: 'Gas is paid from your stablecoin — pennies per transaction',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'Instant Settlement',
    desc: 'Settles faster than a card swipe — seconds, not minutes',
  },
];

export default function FeaturesSection() {
  const ref = useScrollAnimationGroup<HTMLDivElement>();

  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div ref={ref} className="scroll-reveal-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="hover-lift p-5 rounded-xl border border-[#2a2a36] bg-[#141419]"
            >
              <div className="text-2xl mb-3 text-[#28A0F0]">{f.icon}</div>
              <h3 className="text-sm font-semibold text-white mb-1.5">{f.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
