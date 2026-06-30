import HistoryPage from '@/components/HistoryPage';
import withAuth from '@/hocs/withAuth';

function History() {
  return <HistoryPage />;
}

export default withAuth(History);
