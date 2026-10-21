import { describe, expect, it } from 'vitest';
import { code128Modules, code128Svg, code128Values } from '../src/lib/barcode128';
import { labelSettingsFrom, labelsHtml } from '../src/lib/labels';
// The ERP's encoder (checked with a ZXing barcode reader): the phone must print identical bars.
import * as erp from '../../sacone-erp/lib/barcode128.js';
import * as erpLabels from '../../sacone-erp/lib/labels.js';

describe('Code 128 on SAC-POS', () => {
  it('matches the ERP encoder bar for bar', () => {
    for (const text of ['8901001000007', '89010010', 'GRO-RIC-007', 'CSV-A-1', '12', 'abc xyz']) {
      expect(code128Modules(text)).toEqual(erp.code128Modules(text));
    }
  });
  it('uses code set C for even-length digits', () => {
    expect(code128Values('1234')[0]).toBe(105);
    expect(code128Values('123')[0]).toBe(104);
  });
  it('rejects characters a barcode cannot carry', () => {
    expect(() => code128Svg('₹100')).toThrow();
  });
});

describe('labels on SAC-POS', () => {
  const product = { name: 'Basmati Rice 5kg', sku: 'GRO-RIC-007', barcode: '8901001000007', mrp: 650, sellingPrice: 599, gstPercentage: 5, unitAbbreviation: 'KG' };
  it('reads ERP label settings, defaulting when blank', () => {
    expect(labelSettingsFrom([{ key: 'label.size', value: '38x25' }, { key: 'label.fields', value: 'name,barcode,mrp' }])).toEqual({ size: '38x25', fields: ['name', 'barcode', 'mrp'], footer: '' });
    expect(labelSettingsFrom([]).size).toBe('50x25');
  });
  it('prints the same label HTML as the ERP', () => {
    const opts = { size: '50x25', fields: ['business', 'name', 'barcode', 'barcodeText', 'mrp', 'price'], company: { businessName: 'SARTHI' }, footer: '' };
    const html = labelsHtml([{ product, copies: 3 }], opts);
    expect(html).toBe(erpLabels.labelsHtml([{ product, copies: 3 }], opts));
    expect(html.match(/class="lbl"/g)).toHaveLength(3);
    expect(html).toContain('@page{size:50mm 25mm');
    expect(html).toContain('₹628.95'); // 599 + 5% GST
  });
  it('A4 sheets lay out pages', () => {
    const html = labelsHtml([{ product, copies: 70 }], { size: 'a4-65', fields: ['name', 'barcode'] });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
  });
});
