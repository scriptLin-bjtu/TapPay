import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';
import Spinner from '@/components/ui/Spinner';

export default function LoginPage() {
  const router = useRouter();
  const {
    token,
    email,
    setEmail,
    emailError,
    setEmailError,
    loggingIn,
    oauthRedirecting,
    handleEmailLogin,
    handleGoogleLogin,
    magic,
  } = useAuth();

  const [redirectPath, setRedirectPath] = useState('/merchant');

  // Read redirect param from URL
  useEffect(() => {
    const r = router.query.redirect;
    if (typeof r === 'string' && r.startsWith('/')) {
      setRedirectPath(r);
    }
  }, [router.query.redirect]);

  // If already logged in, redirect immediately (skip if OAuth callback is handling it)
  useEffect(() => {
    if (token && !oauthRedirecting) {
      router.replace(redirectPath);
    }
  }, [token, redirectPath, router, oauthRedirecting]);

  const onEmailLogin = () => {
    handleEmailLogin(redirectPath);
  };

  const onGoogleLogin = () => {
    handleGoogleLogin(redirectPath);
  };

  // Don't render login form if already logged in (will redirect)
  if (token) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#28A0F0' }}>
            TapPay
          </h1>
          <p className="text-text-muted text-sm mt-2">Sign in to continue</p>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: '#141419', border: '1px solid #2a2a36' }}
        >
          <div className="flex flex-col gap-3">
            <p className="text-text-secondary text-sm">Sign in with email</p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => {
                if (emailError) setEmailError(false);
                setEmail(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEmailLogin();
              }}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-light text-text-primary text-sm outline-none"
              style={{ border: `1px solid ${emailError ? '#ef4444' : '#2a2a36'}` }}
            />
            {emailError && (
              <span className="text-xs" style={{ color: '#ef4444' }}>
                Enter a valid email
              </span>
            )}
            <button
              onClick={onEmailLogin}
              disabled={loggingIn || !magic || email.length === 0}
              className="w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
              style={{ background: '#28A0F0' }}
            >
              {loggingIn ? <Spinner /> : 'Log in / Sign up'}
            </button>

            <div className="flex items-center gap-3 my-1">
              <span className="flex-1 h-px" style={{ background: '#2a2a36' }} />
              <span className="text-text-muted text-xs">or</span>
              <span className="flex-1 h-px" style={{ background: '#2a2a36' }} />
            </div>

            <button
              onClick={onGoogleLogin}
              disabled={loggingIn || !magic}
              className="w-full py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: '#ffffff', color: '#1f2328' }}
            >
              <GoogleIcon />
              {loggingIn ? 'Redirecting...' : 'Continue with Google'}
            </button>
          </div>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          Built with Particle Universal Accounts &middot; EIP-7702 &middot; Magic
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
