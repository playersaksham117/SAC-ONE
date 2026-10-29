'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, LoadingState, Modal } from '../ui';

/**
 * Short description of each line of an invoice or a quotation (one line of specs or the work
 * done), printed under the item. Only the text changes: stock, prices, totals and the number stay.
 */
export default function ShortDescriptionDialog({ saleId, quotationId, onClose, onSaved }) {
  const isQuote = Boolean(quotationId);
  const base = isQuote ? `/api/pos/quotations/${quotationId}` : `/api/pos/sales/${saleId}`;
  const [sale, setSale] = useState(null);
  const [texts, setTexts] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest(base)
      .then((s) => {
        setSale(s);
        setTexts(Object.fromEntries((s.items || []).map((i) => [i.id, i.shortDescription || ''])));
      })
      .catch((e) => setError(e.message));
  }, [base]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (isQuote) {
        await apiRequest(`${base}/descriptions`, { method: 'PUT', body: JSON.stringify({ descriptions: sale.items.map((i) => (texts[i.id] || '').trim()) }) });
      } else {
        for (const item of sale.items) {
          const text = (texts[item.id] || '').trim();
          if (text === (item.shortDescription || '').trim()) continue;
          await apiRequest(`${base}/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ description: text }) });
        }
      }
      onSaved?.(sale);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={sale ? `Short description · ${sale.invoiceNumber || sale.quotationNumber}` : 'Short description'} onClose={onClose} size="lg">
      <Alert message={error} />
      {!sale ? (!error && <LoadingState />) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Prints under the item on this {isQuote ? 'quotation' : 'invoice'} only. {isQuote ? 'Prices and totals' : 'Stock, prices and totals'} do not change.</p>
          {sale.items.map((item) => (
            <label key={item.id} className="block text-sm">
              <span className="font-medium text-slate-800">{item.productName}</span>
              <span className="ml-2 text-xs text-slate-400">{item.sku}</span>
              <input
                className="input-field mt-1"
                maxLength={500}
                placeholder="e.g. 1200 mm, 75 W, 5-star, colour white"
                value={texts[item.id] ?? ''}
                onChange={(e) => setTexts((t) => ({ ...t, [item.id]: e.target.value }))}
              />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
