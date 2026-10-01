import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { CustomerDraft } from '../../domain/validation';
import { ValidationError, createCustomer } from '../../services/pos';
import { useCart } from '../../store/cart';
import { useCan } from '../../store/session';
import { Banner, Button, Card, Empty, Field, Header, Screen, space } from '../../ui/components';

export default function NewCustomer() {
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const allowed = useCan('createCustomers');
  const [d, setD] = useState<CustomerDraft>({ name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  if (!allowed) {
    return (
      <Screen>
        <Header title="New customer" onBack={() => router.back()} />
        <Empty icon="lock-closed-outline" title="Not allowed" message='Your ERP role needs "Customers – create".' />
      </Screen>
    );
  }

  const set = (k: keyof CustomerDraft) => (v: string) => setD({ ...d, [k]: v });

  const save = () => {
    setErrors({});
    setGeneral(null);
    try {
      const c = createCustomer(d);
      if (pick) useCart.getState().setCustomer(c.id);
      router.back();
      if (pick) router.back();
    } catch (e) {
      if (e instanceof ValidationError) {
        const map: Record<string, string> = {};
        for (const err of e.result.errors) if (err.field) map[err.field] = err.message;
        setErrors(map);
        setGeneral(e.result.errors.filter((x) => !x.field).map((x) => x.message).join('\n') || null);
      } else {
        setGeneral((e as Error).message);
      }
    }
  };

  return (
    <Screen padded={false} scroll>
      <Header title="New customer" subtitle="Saved now, sent to SACONE on next sync" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg }}>
        {general ? <Banner tone="danger" messages={[general]} /> : null}
        <Card>
          <Field label="Name *" value={d.name} onChangeText={set('name')} error={errors.name} placeholder="Business or person name" testID="cust-name" />
          <Field label="Mobile *" value={d.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" placeholder="98765 43210" testID="cust-phone" />
          <Field label="GSTIN" value={d.gstin} onChangeText={(v) => set('gstin')(v.toUpperCase())} error={errors.gstin} autoCapitalize="characters" placeholder="27AABCU9603R1ZM" hint="For B2B tax invoices; decides CGST/SGST vs IGST" />
          <Field label="Email" value={d.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Address" value={d.address} onChangeText={set('address')} />
          <Field label="City" value={d.city} onChangeText={set('city')} />
          <Field label="State" value={d.state} onChangeText={set('state')} />
          <Button title="Save customer" icon="checkmark" onPress={save} size="lg" testID="cust-save" />
        </Card>
      </View>
    </Screen>
  );
}
