'use client';

import CsvImportDialog from '../common/CsvImportDialog';

const COLUMNS = [
  'sku', 'name', 'item_type', 'barcode', 'category', 'brand', 'unit', 'model_variant', 'hsn_code', 'gst_percentage',
  'mrp', 'selling_price', 'purchase_price', 'reorder_level', 'minimum_stock', 'image_url', 'description', 'is_active', 'web_store_published',
  'warranty', 'guarantee',
];
const TEMPLATE = [
  COLUMNS.join(','),
  'RICE-5KG,Basmati Rice 5kg,product,,Grocery,Daawat,KG,5 kg,1006,5,650,599,480,10,5,,Long grain rice,1,0,,',
  'FAN-1200,Ceiling Fan 1200mm,product,,Fans,Havells,NOS,,8414,18,3200,2800,2300,5,2,,"1200 mm, 75 W, 5-star, copper motor",1,0,2 years,6 months',
  ',Fan installation,service,,Services,,NOS,,998719,18,300,250,,,,,On-site installation,1,0,30 days,',
].join('\n');

/** Products & Services CSV import. */
export default function ProductCsvImport({ onClose, onImported }) {
  return (
    <CsvImportDialog
      title="Import Products CSV"
      endpoint="/api/products/import"
      columns={COLUMNS}
      required={[['name', 'product_name', 'item_name']]}
      checkFirst
      aliases={['hsn', 'sac', 'hsn_sac', 'type', 'unit_name', 'variant', 'model', 'product_name', 'item_name', 'item_code', 'product_code', 'gst', 'gst_rate', 'price', 'sale_price', 'cost_price', 'active']}
      template={TEMPLATE}
      templateName="products-template.csv"
      noun="product"
      help={(
        <>
          Required: <code>name</code>. Optional: sku, item_type (product / service), barcode, category, brand, unit, model_variant, hsn_code,
          gst_percentage, mrp, selling_price, purchase_price, reorder_level, minimum_stock, image_url, description, is_active, web_store_published,
          warranty and guarantee (e.g. 1 year, 18 months, 90 days).
          {' '}<b>No duplicate names:</b> a row is matched to a product by its SKU (or by its name when the SKU is blank) and updated;
          a name already used by another product, or repeated in the file, is skipped. Capitals and extra spaces don&apos;t make a name different.
          Blank cells keep the product&apos;s current values. A barcode already on another product is not copied: a new product gets a fresh barcode instead (shown before importing). A new product with a blank SKU gets one made; new categories, brands and units are added.
          Prices may be written like ₹1,200 and GST like 18%.
        </>
      )}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
