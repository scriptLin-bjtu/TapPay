import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [merchant, setMerchant] = useState('');

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setMerchant(u);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-5xl font-bold tracking-tight" style={{ color: '#28A0F0' }}>
          TapPay
        </h1>
        <p className="mt-3 text-text-secondary text-sm">
          One-tap crypto payments at the till.
          <br />
          NFC tap → pay in 2 seconds.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          {merchant && (
            <Link
              href={`/pay?m=${merchant}`}
              className="block w-full py-3 rounded-lg font-semibold text-white"
              style={{ background: '#28A0F0' }}
            >
              Open my payment link
            </Link>
          )}
          <Link
            href="/pay?m=0x985c1b87cc0b08a138396cd1d012887935a353f4"
            className="block w-full py-3 rounded-lg font-semibold border"
            style={{ borderColor: '#2a2a36', color: '#f0f0f5' }}
          >
            Try a demo payment
          </Link>
        </div>

        <p className="mt-10 text-text-muted text-xs">
          Are you a merchant? Generate an order from your terminal and tap a phone to collect.
        </p>
      </div>
    </main>
  );
}
