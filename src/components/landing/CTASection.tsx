import { useRouter } from 'next/router';
import Link from 'next/link';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

export default function CTASection() {
  const router = useRouter();
  const ref = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-20 px-6">
      <div ref={ref} className="scroll-reveal max-w-xl mx-auto text-center">
        <h2 className="text-xl font-semibold text-white mb-3">
          Try It Now
        </h2>
        <p className="text-sm text-text-secondary mb-8">
          Tap. Pay. Done. — crypto payments that feel like Apple Pay.
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-3 mb-10">
          <button
            onClick={() => router.push('/merchant')}
            className="px-8 py-3.5 rounded-lg font-semibold text-sm text-white bg-[#28A0F0] hover:bg-[#1e8fd8] transition-colors duration-200"
          >
            I&apos;m a Merchant
          </button>
          <button
            onClick={() => {
              alert('Please scan the merchant\'s NFC tag to pay, or visit the demo link:\n/pay?m=0xDemo&o=1');
            }}
            className="px-8 py-3.5 rounded-lg font-semibold text-sm text-white border border-[#2a2a36] hover:border-[#28A0F0] hover:text-[#28A0F0] transition-colors duration-200"
          >
            I&apos;m a Buyer
          </button>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Built with Particle Universal Accounts &middot; EIP-7702 &middot; Magic
        </p>

        <Link
          href="/history"
          className="text-xs text-gray-500 hover:text-[#28A0F0] transition-colors"
        >
          View Order History →
        </Link>
      </div>
    </section>
  );
}
