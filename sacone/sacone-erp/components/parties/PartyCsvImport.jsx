'use client';

import CsvImportDialog from '../common/CsvImportDialog';

const SPEC = {
  customers: {
    title: 'Import Customers CSV',
    endpoint: '/api/customers/import',
    noun: 'customer',
    columns: ['code', 'name', 'phone', 'email', 'gst_number', 'gst_state_code', 'address', 'city', 'state', 'credit_limit', 'credit_approved', 'notes', 'is_active'],
    aliases: ['customer_code', 'customer_name', 'mobile', 'gstin', 'gst', 'state_code'],
    template: [
      'code,name,phone,email,gst_number,gst_state_code,address,city,state,credit_limit,credit_approved,notes,is_active',
      ',Kumar Traders,9876543210,kumar@example.com,03ABCDE1234F1Z5,03,12 Mall Road,Jalandhar,Punjab,50000,yes,Wholesale buyer,1',
      ',Walk-in regular,9812345678,,,,,Jalandhar,Punjab,0,no,,1',
    ].join('\n'),
    help: 'Required: name. Optional: code, phone, email, gst_number, gst_state_code, address, city, state, credit_limit, credit_approved (yes / no, applied only for the firm admin), notes, is_active. A row matching an existing customer by code, GSTIN or mobile updates it; others are added.',
  },
  suppliers: {
    title: 'Import Suppliers CSV',
    endpoint: '/api/suppliers/import',
    noun: 'supplier',
    columns: ['code', 'name', 'contact_name', 'phone', 'email', 'gst_number', 'gst_state_code', 'address', 'city', 'state', 'payment_terms', 'notes', 'is_active'],
    aliases: ['supplier_code', 'supplier_name', 'contact_person', 'contact', 'mobile', 'gstin', 'gst', 'state_code', 'terms'],
    template: [
      'code,name,contact_name,phone,email,gst_number,gst_state_code,address,city,state,payment_terms,notes,is_active',
      ',Fresh Foods Distributors,Ravi,9123456780,sales@freshfoods.example,03AABCF1234G1Z2,03,Industrial Area,Ludhiana,Punjab,Net 30,,1',
    ].join('\n'),
    help: 'Required: name. Optional: code, contact_name, phone, email, gst_number, gst_state_code, address, city, state, payment_terms, notes, is_active. A row matching an existing supplier by code, GSTIN or mobile updates it; others are added.',
  },
};

/** Customers or suppliers CSV import (kind = 'customers' | 'suppliers'). */
export default function PartyCsvImport({ kind, onClose, onImported }) {
  const spec = SPEC[kind];
  return (
    <CsvImportDialog
      title={spec.title}
      endpoint={spec.endpoint}
      columns={spec.columns}
      required={[['name', `${spec.noun}_name`]]}
      aliases={spec.aliases}
      template={spec.template}
      templateName={`${kind}-template.csv`}
      noun={spec.noun}
      help={spec.help}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
