import PayPage from '@/components/PayPage';
import withAuth from '@/hocs/withAuth';

function Pay() {
  return <PayPage />;
}

export default withAuth(Pay);
