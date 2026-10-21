-- Parties with a GSTIN but no GST state code: take the state code from the GSTIN's first two
-- digits, so inter-state bills get IGST (bills were split CGST + SGST when the code was empty).
UPDATE customers SET gst_state_code = substr(gst_number, 1, 2)
WHERE (gst_state_code IS NULL OR trim(gst_state_code) = '') AND gst_number GLOB '[0-9][0-9]*' AND length(gst_number) = 15;

UPDATE suppliers SET gst_state_code = substr(gst_number, 1, 2)
WHERE (gst_state_code IS NULL OR trim(gst_state_code) = '') AND gst_number GLOB '[0-9][0-9]*' AND length(gst_number) = 15;

UPDATE companies SET gst_state_code = substr(gst_number, 1, 2)
WHERE (gst_state_code IS NULL OR trim(gst_state_code) = '') AND gst_number GLOB '[0-9][0-9]*' AND length(gst_number) = 15;
