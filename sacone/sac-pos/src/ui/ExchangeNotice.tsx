import { View } from 'react-native';
import { formatMoney } from '../domain/money';
import { useCart } from '../store/cart';
import { Banner, space } from './components';

/** Shown on Sell and Cart while an exchange credit is waiting to be used on the bill being built. */
export function ExchangeNotice() {
  const ex = useCart((s) => s.exchange);
  if (!ex) return null;
  return (
    <View style={{ marginTop: space.md }}>
      <Banner
        tone="info"
        title={`Exchange credit ${formatMoney(ex.amount)}`}
        messages={[`From return ${ex.returnNumber} on bill ${ex.saleNumber}. Add the replacement items; the credit is applied at payment.`]}
      />
    </View>
  );
}
