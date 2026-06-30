import Head from 'next/head';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import FlowSection from '@/components/landing/FlowSection';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <>
      <Head>
        <title>TapPay - Tap to Pay, Instant Settlement</title>
        <meta name="description" content="Crypto's first true tap-to-pay. Built on Arbitrum + Particle UA + Magic." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <HeroSection />
        <FeaturesSection />
        <FlowSection />
        <CTASection />
        <Footer />
      </div>
    </>
  );
}
