import type { StockStatus } from '@/features/catalog/stock';

export type VariantRow = { size: string; color: string; stock: number };

/** A product as the rest of the system reads it: variants already folded into sizes/colors/stockStatus. */
export type CatalogProduct = {
  code: string;
  name: string;
  category: string;
  description: string;
  material: string;
  priceVnd: number;
  compareAtPriceVnd: number | null;
  /** Sizes/colours that can still be bought (all of them when everything is sold out). */
  sizes: string[];
  colors: string[];
  stockStatus: StockStatus;
  updatedAt: string;
};

/** One normalised row of the catalog spreadsheet. */
export type ImportRow = {
  code: string;
  name: string;
  category: string;
  priceVnd: number;
  description: string;
  material: string;
  sizes: string[];
  colors: string[];
  stockStatus: string;
  updatedAt: string;
};
