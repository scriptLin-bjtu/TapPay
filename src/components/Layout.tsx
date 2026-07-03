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

  const shorten = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;

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
              <span className="text-gray-500">|</span>
              <Link
                href="/history"
                className="text-gray-300 hover:text-[#28A0F0] transition-colors"
              >
                History
              </Link>
              <Link
                href="/account"
                className="text-gray-300 hover:text-[#28A0F0] transition-colors"
              >
                Account
              </Link>
            </div>
            {accountInfo.ownerAddress && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 font-mono">
                  {shorten(accountInfo.ownerAddress)}
                </span>
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
