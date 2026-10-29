'use client';

import CsvImportDialog from '../common/CsvImportDialog';

const COLUMNS = [
  'sku', 'name', 'item_type', 'barcode', 'category', 'brand', 'unit', 'model_variant', 'hsn_code', 'gst_percentage',
  'mrp', 'selling_price', 'purchase_price', 'reorder_level', 'minimum_stock', 'image_url', 'description', 'is_active', 'web_store_published',
  'warranty', 'guarantee',
];
const TEMPLATE = [
  COLUMNS.join(','),
  'RICE-5KG,Basmati Rice 5kg,product,,Grocery,Daawat,KG,5 kg,1006,5,650,599,480,10,5,,Long grain rice,1,0,,,Extra long grain aged basmati',
  'FAN-1200,Ceiling Fan 1200mm,product,,Fans,Havells,NOS,,8414,18,3200,2800,2300,5,2,,Energy saving fan,1,0,2 years,6 months,"1200 mm, 75 W, 5-star, copper motor"',
  'SRV-INSTALL,Fan installation,service,,Services,,NOS,,998719,18,300,250,,,,,On-site installation,1,0,30 days,,',
].join('\n');

/** Products & Services CSV import. */
export default function ProductCsvImport({ onClose, onImported }) {
  return (
    <CsvImportDialog
      title="Import Products CSV"
      endpoint="/api/products/import"
      columns={COLUMNS}
      required={['sku', 'name']}
      aliases={['hsn', 'sac', 'hsn_sac', 'type', 'unit_name', 'variant', 'model']}
      template={TEMPLATE}
      templateName="products-template.csv"
      noun="product"
      help={(
        <>
          Required: <code>sku</code>, <code>name</code>. Optional: item_type (product / service), barcode, category, brand, unit, model_variant, hsn_code,
          gst_percentage, mrp, selling_price, purchase_price, reorder_level, minimum_stock, image_url, description, is_active, web_store_published,
          warranty and guarantee (e.g. 1 year, 18 months, 90 days).
          An existing SKU is updated; a new SKU is created; a blank SKU gets one made automatically. New categories, brands and units are added automatically.
        </>
      )}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
