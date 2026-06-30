import { useEffect, useState, type ComponentType } from 'react';
import { useRouter } from 'next/router';
import Spinner from '@/components/ui/Spinner';

export default function withAuth<P extends object>(WrappedComponent: ComponentType<P>) {
  function ProtectedRoute(props: P) {
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
      const token = localStorage.getItem('token');
      if (!token) {
        const redirect = router.asPath;
        router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
      } else {
        setChecking(false);
      }
    }, [router]);

    if (checking) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <Spinner />
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  }

  ProtectedRoute.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return ProtectedRoute;
}
