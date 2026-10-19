-- GST bills: transport / dispatch details and a "Shipped To" (consignee) different from the buyer.
-- Both are JSON objects; NULL = not given (the bill shows the buyer as consignee).
--   transport_details: { mode, transporter, vehicleNumber, lrNumber, lrDate, ewayBillNumber }
--   ship_to:           { name, address, city, state, stateCode, gstin, phone }
ALTER TABLE pos_sales ADD COLUMN transport_details TEXT;
ALTER TABLE pos_sales ADD COLUMN ship_to TEXT;
