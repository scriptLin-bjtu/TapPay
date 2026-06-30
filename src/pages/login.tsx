import Head from 'next/head';
import LoginPage from '@/components/LoginPage';

export default function Login() {
  return (
    <>
      <Head>
        <title>Sign In - TapPay</title>
        <meta name="description" content="Sign in to your TapPay account" />
      </Head>
      <LoginPage />
    </>
  );
}
