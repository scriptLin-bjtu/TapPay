import MerchantDashboard from '@/components/MerchantDashboard';
import withAuth from '@/hocs/withAuth';

function Merchant() {
  return <MerchantDashboard />;
}

export default withAuth(Merchant);
