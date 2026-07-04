import { useRouter } from 'next/router';

export default function HeroSection() {
  const router = useRouter();

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      {/* NFC Animation */}
      <div className="nfc-animation-container mb-10">
        {/* NFC Tag */}
        <div className="nfc-tag">
          <span className="nfc-tag-label">NFC</span>
        </div>

        {/* Phone */}
        <div className="nfc-phone">
          <div className="nfc-phone-screen">
            {/* Success check on screen */}
            <svg className="nfc-screen-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="nfc-screen-text">Paid</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
        <span className="text-[#28A0F0]">Tap</span>
        <span className="text-white">Pay</span>
      </h1>

      {/* Subtitle */}
      <p className="text-xl md:text-2xl text-text-secondary font-medium mb-3">
        One tap to pay with crypto
      </p>

      {/* English tagline */}
      <p className="text-sm text-text-muted mb-12">
        No wallet app &middot; No chain switching &middot; No friction
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => router.push('/merchant')}
          className="px-8 py-3.5 rounded-lg font-semibold text-sm text-white bg-[#28A0F0] hover:bg-[#1e8fd8] transition-colors duration-200"
        >
          I&apos;m a Merchant
        </button>
        <button
          onClick={() => router.push('/login?redirect=' + encodeURIComponent('/account?showTutorial=true'))}
          className="px-8 py-3.5 rounded-lg font-semibold text-sm text-white border border-[#2a2a36] hover:border-[#28A0F0] hover:text-[#28A0F0] transition-colors duration-200"
        >
          I&apos;m a Buyer
        </button>
      </div>
    </section>
  );
}
