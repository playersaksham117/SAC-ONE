-- What a line cost the business to provide (mainly services, which have no purchase bill and
-- cost differently for every job). Total for the line in ₹ before GST; NULL = not entered, the
-- profit report then falls back to purchase rates. A line's short_description can also be set
-- per invoice (the work done for this customer) instead of the product's.
ALTER TABLE pos_sale_items ADD COLUMN cost_amount REAL;
