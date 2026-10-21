'use client';

/**
 * Fill Ship To from a registered address: one of the group's own firms (shop / branch / godown)
 * or a customer's billing / shipping address. The fields stay editable after picking.
 */
export default function ShipToPicker({ firms = [], customers = [], onPick }) {
  const withAddress = customers.filter((c) => c.address || c.shippingAddress || c.city);
  if (!firms.length && !withAddress.length) return null;
  const pick = (value) => {
    if (!value) return;
    const [kind, id, which] = value.split(':');
    if (kind === 'firm') {
      const f = firms.find((x) => x.firmId === id);
      if (f) onPick({ name: f.name, address: f.address, city: f.city, state: f.state, gstin: f.gstin, phone: f.phone });
    } else {
      const c = customers.find((x) => x.id === id);
      if (!c) return;
      const ship = which === 'ship';
      onPick({
        name: c.name,
        address: ship ? c.shippingAddress : c.address,
        city: (ship ? c.shippingCity : c.city) || '',
        state: (ship ? c.shippingState : c.state) || c.state || '',
        gstin: c.gstNumber || '',
        phone: c.phone || '',
      });
    }
  };
  return (
    <label className="mt-3 block text-sm">
      <span className="label">Choose a registered address</span>
      <select className="input-field" value="" onChange={(e) => pick(e.target.value)}>
        <option value="">— pick to fill the fields below —</option>
        {firms.length > 0 && (
          <optgroup label="Our firms">
            {firms.map((f) => <option key={f.firmId} value={`firm:${f.firmId}`}>{f.name}{f.city ? ` · ${f.city}` : ''}{f.gstin ? ` · ${f.gstin}` : ''}</option>)}
          </optgroup>
        )}
        {withAddress.length > 0 && (
          <optgroup label="Customers">
            {withAddress.flatMap((c) => [
              <option key={c.id} value={`cust:${c.id}:bill`}>{c.name}{c.city ? ` · ${c.city}` : ''}</option>,
              ...(c.shippingAddress ? [<option key={`${c.id}-s`} value={`cust:${c.id}:ship`}>{c.name} · shipping address</option>] : []),
            ])}
          </optgroup>
        )}
      </select>
    </label>
  );
}
