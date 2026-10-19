import { Text, View } from 'react-native';
import { TRANSPORT_MODES, type ShipToDraft, type TransportDraft } from '../domain/dispatch';
import { todayPoText } from '../domain/po';
import { Button, Card, Chip, Field, Row, SectionTitle, colors, font, space } from './components';

/**
 * GST bill extras at checkout: Transport details and a separate Ship To (consignee).
 * Bill To is always the customer chosen for the bill.
 */
export function DispatchSection({
  billToName, transportOn, setTransportOn, transport, setTransport, transportError,
  shipOn, setShipOn, shipTo, setShipTo, shipError,
}: {
  billToName: string | null;
  transportOn: boolean; setTransportOn: (v: boolean) => void;
  transport: TransportDraft; setTransport: (v: TransportDraft) => void; transportError: string | null;
  shipOn: boolean; setShipOn: (v: boolean) => void;
  shipTo: ShipToDraft; setShipTo: (v: ShipToDraft) => void; shipError: string | null;
}) {
  const tSet = (k: keyof TransportDraft) => (v: string) => setTransport({ ...transport, [k]: v });
  const sSet = (k: keyof ShipToDraft) => (v: string) => setShipTo({ ...shipTo, [k]: v });
  return (
    <>
      <View style={{ marginTop: space.md }}>
        <SectionTitle right={<Chip label={shipOn ? 'Different Ship To' : 'Ship To = Bill To'} icon="location-outline" active={shipOn} onPress={() => setShipOn(!shipOn)} />}>
          Bill To / Ship To
        </SectionTitle>
        <Card>
          <Text style={{ color: colors.textMuted, fontSize: font.xs }}>Bill To (buyer)</Text>
          <Text style={{ fontWeight: '700', color: colors.text, marginBottom: shipOn ? space.md : 0 }}>{billToName || 'Walk-in customer'}</Text>
          {shipOn ? (
            <>
              <Text style={{ color: colors.textMuted, fontSize: font.xs, marginBottom: space.xs }}>Ship To (consignee)</Text>
              <Field label="Name" value={shipTo.name} onChangeText={sSet('name')} placeholder="Consignee / site name" testID="ship-name" />
              <Field label="Address" value={shipTo.address} onChangeText={sSet('address')} placeholder="Delivery address" multiline testID="ship-address" />
              <Row>
                <Field label="City" value={shipTo.city} onChangeText={sSet('city')} style={{ flex: 1 }} />
                <Field label="State" value={shipTo.state} onChangeText={sSet('state')} style={{ flex: 1 }} />
              </Row>
              <Row>
                <Field label="GSTIN (optional)" value={shipTo.gstin} onChangeText={sSet('gstin')} autoCapitalize="characters" maxLength={15} style={{ flex: 1 }} testID="ship-gstin" />
                <Field label="Phone" value={shipTo.phone} onChangeText={sSet('phone')} keyboardType="phone-pad" style={{ flex: 1 }} />
              </Row>
              {shipError ? <Text style={{ color: colors.danger }}>{shipError}</Text> : null}
              <Text style={{ color: colors.textFaint, fontSize: font.xs }}>GST is charged as per the Bill To party; Ship To is printed as the consignee.</Text>
            </>
          ) : null}
        </Card>
      </View>

      <View style={{ marginTop: space.md }}>
        <SectionTitle right={<Chip label={transportOn ? 'Transport on' : 'Add transport'} icon="car-outline" active={transportOn} onPress={() => setTransportOn(!transportOn)} />}>
          Transport
        </SectionTitle>
        {transportOn ? (
          <Card>
            <Text style={{ color: colors.textMuted, fontSize: font.xs, marginBottom: space.xs }}>Mode</Text>
            <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              {TRANSPORT_MODES.map((m) => <Chip key={m} label={m} active={transport.mode === m} onPress={() => tSet('mode')(transport.mode === m ? '' : m)} />)}
            </Row>
            <Field label="Transporter" value={transport.transporter} onChangeText={tSet('transporter')} placeholder="Transport company" testID="transporter" />
            <Field label="Vehicle No." value={transport.vehicleNumber} onChangeText={tSet('vehicleNumber')} placeholder="PB08 AB 1234" autoCapitalize="characters" maxLength={20} testID="vehicle-no" />
            <Row style={{ alignItems: 'flex-end' }}>
              <Field label="LR / GR No." value={transport.lrNumber} onChangeText={tSet('lrNumber')} style={{ flex: 1, marginBottom: 0 }} />
              <Field label="LR date" value={transport.lrDate} onChangeText={tSet('lrDate')} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" style={{ flex: 1, marginBottom: 0 }} />
              <Button title="Today" variant="ghost" size="sm" onPress={() => tSet('lrDate')(todayPoText())} />
            </Row>
            <Field label="E-way bill No." value={transport.ewayBillNumber} onChangeText={tSet('ewayBillNumber')} keyboardType="number-pad" maxLength={12} style={{ marginTop: space.md }} testID="eway-no" />
            {transportError ? <Text style={{ color: colors.danger }}>{transportError}</Text> : null}
          </Card>
        ) : null}
      </View>
    </>
  );
}
