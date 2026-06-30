import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useMagic } from '@/hooks/MagicProvider';
import { saveUserInfo } from '@/utils/common';
import showToast from '@/utils/showToast';

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

export function useAuth() {
  const router = useRouter();
  const { magic } = useMagic();

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [oauthRedirecting, setOauthRedirecting] = useState(false);

  // Read token on mount
  useEffect(() => {
    setToken(localStorage.getItem('token') ?? '');
  }, []);

  // Handle OAuth redirect callback
  useEffect(() => {
    if (!magic) return;
    // Only call getRedirectResult when OAuth params are in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const hasOAuthParams = urlParams.has('code') || urlParams.has('state');
    if (!hasOAuthParams) return;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    const tryGetResult = (attempt = 0) => {

      magic.oauth2
        .getRedirectResult()
        .then((result) => {
          if (!active) return;
          const meta = result?.magic?.userMetadata;
          const addr = meta?.wallets?.ethereum?.publicAddress;
          const idToken = result?.magic?.idToken;
          if (addr && idToken) {
            setToken(idToken);
            saveUserInfo(idToken, 'SOCIAL', addr);
            setOauthRedirecting(true);
            const redirect = sessionStorage.getItem('login_redirect');
            sessionStorage.removeItem('login_redirect');
            router.replace(redirect || '/');
          }
        })
        .catch((e) => {
          if (!active) return;
          console.warn(`[useAuth] OAuth attempt ${attempt + 1} failed:`, e?.message);
          // Retry up to 3 times with increasing delay for PKCE metadata race condition
          if (attempt < 3 && /PKCE|metadata|session/i.test(e?.message || '')) {
            const delay = (attempt + 1) * 1000;
            console.log(`[useAuth] Retrying in ${delay}ms...`);
            retryTimer = setTimeout(() => tryGetResult(attempt + 1), delay);
          }
        });
    };

    // Small initial delay to let Magic SDK fully initialize after redirect
    retryTimer = setTimeout(() => tryGetResult(), 500);

    return () => {
      active = false;
      clearTimeout(retryTimer);
    };
  }, [magic, router]);

  const handleEmailLogin = useCallback(
    async (redirectPath?: string) => {
      if (!magic) return;
      if (!EMAIL_RE.test(email)) {
        setEmailError(true);
        return;
      }
      setLoggingIn(true);
      try {
        const t = await magic.auth.loginWithEmailOTP({ email });
        const info = await magic.user.getInfo();
        const addr = info?.wallets?.ethereum?.publicAddress;
        if (!t || !addr) throw new Error('Magic login failed');
        setToken(t);
        saveUserInfo(t, 'EMAIL', addr);
        setEmail('');
        // Redirect after login
        const redirect = redirectPath || '/merchant';
        router.replace(redirect);
      } catch (e: any) {
        console.error('login error:', e);
        showToast({ message: 'Login failed: ' + (e?.message || String(e)), type: 'error' });
      } finally {
        setLoggingIn(false);
      }
    },
    [magic, email, router],
  );

  const handleGoogleLogin = useCallback(
    async (redirectPath?: string) => {
      if (!magic) return;
      setLoggingIn(true);
      // Save redirect path for post-OAuth recovery
      if (redirectPath) {
        sessionStorage.setItem('login_redirect', redirectPath);
      }
      try {
        await magic.oauth2.loginWithRedirect({
          provider: 'google',
          redirectURI: window.location.origin + '/login',
        });
      } catch (e: any) {
        console.error('google login error:', e);
        showToast({ message: 'Google login failed: ' + (e?.message || String(e)), type: 'error' });
        setLoggingIn(false);
      }
    },
    [magic],
  );

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

  return {
    token,
    setToken,
    email,
    setEmail,
    emailError,
    setEmailError,
    loggingIn,
    oauthRedirecting,
    handleEmailLogin,
    handleGoogleLogin,
    handleLogout,
    magic,
  };
}
