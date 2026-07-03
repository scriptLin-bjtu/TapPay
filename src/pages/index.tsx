import Head from 'next/head';
import GradientBackground from '@/components/landing/GradientBackground';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import FlowSection from '@/components/landing/FlowSection';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <>
      <Head>
        <title>TapPay — Tap. Pay. Any Chain.</title>
        <meta name="description" content="TapPay — tap-to-pay with any stablecoin, on any chain. No wallet, no ETH, no friction. Built with Particle UA & EIP-7702." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <GradientBackground />
      <div className="relative z-10 min-h-screen text-white">
        <HeroSection />
        <FeaturesSection />
        <FlowSection />
        <CTASection />
        <Footer />
      </div>
    </>
  );
}
