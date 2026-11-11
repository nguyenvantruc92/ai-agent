-- Marks the product images that `pnpm db:seed` created (SHA-256 of the seed file), so a later seed can replace them when the
-- file in data/seed/product-images changes, while images an admin uploaded (NULL here) are never touched.
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS seed_hash text;
