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
                  className="flex items-center justify-center w-9 h-9 rounded-full transition-opacity hover:opacity-80"
                  style={{ background: '#2a2a36' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="#9ca3af" />
                    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
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
