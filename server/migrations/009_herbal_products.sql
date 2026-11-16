-- The clinic's herbal preparations, for the documents that go with a DHL parcel (product declaration, MSDS,
-- product info label). A code is either one preparation ("15", "Chandra", "CNR-SO-M") or a whole formula
-- ("3(1) + 14(1) + 15(3)"); a prescribed formula with no entry of its own combines its components' ingredients.
CREATE TABLE IF NOT EXISTS herbal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  code_key text NOT NULL UNIQUE,               -- code without spaces, lower case, for matching
  name text NOT NULL,                          -- e.g. "Elixir herbal liquid", "CNR-SO-1 Herbal Oil"
  product_type text NOT NULL CHECK (product_type IN ('ELIXIR','POWDER','OIL','CAPSULE','OIL_CAPSULE','OTHER')),
  ingredients text NOT NULL DEFAULT '',
  product_use text NOT NULL DEFAULT '',        -- "Food supplements for general health", "External use"
  way_of_use text NOT NULL DEFAULT '',         -- "Internal and external"
  manufacturer text NOT NULL DEFAULT '',
  certificate text NOT NULL DEFAULT '',
  msds jsonb NOT NULL DEFAULT '{}'::jsonb,     -- physical state, colour, odour, flash point, emergency phone …
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
