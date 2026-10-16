-- The firm's own UPI QR image (from its bank / PhonePe / Paytm / GPay business), uploaded on a
-- bank or UPI account as a data URL. Settings → Invoice printing chooses whether bills and
-- SAC-POS show this image or a QR generated from the UPI ID.
ALTER TABLE financial_payment_accounts ADD COLUMN upi_qr_image TEXT;
