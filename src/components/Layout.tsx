import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useMagic } from '@/hooks/MagicProvider';
import { useUniversalAccount } from '@/hooks/UniversalAccountProvider';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { magic } = useMagic();
  const { accountInfo } = useUniversalAccount();

  const [token, setToken] = useState('');

  useEffect(() => {
    setToken(localStorage.getItem('token') ?? '');
  }, []);

  // Re-check token on route change (login/logout may update it)
  useEffect(() => {
    const handleRouteChange = () => {
      setToken(localStorage.getItem('token') ?? '');
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  const handleLogout = useCallback(async () => {
    try {
      if (magic) await magic.user.logout();
    } catch (e) {
      console.warn('magic logout failed', e);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginMethod');
    setToken('');
    router.push('/login');
  }, [magic, router]);

  // Hide nav bar on root page and login page
  const showNav = token && router.pathname !== '/' && router.pathname !== '/login';

  return (
    <>
      {showNav && (
        <header className="border-b border-[#2a2a36]">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-lg font-bold text-[#28A0F0]">
                TapPay
              </Link>
            </div>
            {accountInfo.ownerAddress && (
              <div className="flex items-center gap-3">
                <Link
                  href="/account"
                  className="flex items-center justify-center w-9 h-9 rounded-full transition-all hover:scale-105 hover:bg-[#363646]"
                  style={{ background: '#2a2a36' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="3.5" stroke="#9ca3af" strokeWidth="1.5" />
                    <path d="M5 19.5c0-2.8 3.1-5 7-5s7 2.2 7 5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </Link>
                <button
                  onClick={handleLogout}
                  className="shrink-0 text-xs px-2.5 py-1 rounded-md"
                  style={{
                    background: '#1f1f28',
                    color: '#9ca3af',
                    border: '1px solid #2a2a36',
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>
      )}
      {children}
    </>
  );
}
