import AccountPage from '@/components/AccountPage';
import withAuth from '@/hocs/withAuth';

function Account() {
  return <AccountPage />;
}

export default withAuth(Account);
