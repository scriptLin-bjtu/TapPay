import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MagicProvider from '@/hooks/MagicProvider';
import { UniversalAccountProvider } from '@/hooks/UniversalAccountProvider';
import Layout from '@/components/Layout';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MagicProvider>
      <UniversalAccountProvider>
        <Layout>
          <ToastContainer />
          <Component {...pageProps} />
        </Layout>
      </UniversalAccountProvider>
    </MagicProvider>
  );
}
