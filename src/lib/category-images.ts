import type { StaticImageData } from 'next/image';
import aoSoMi from '@/assets/categories/ao-so-mi.webp';
import aoPolo from '@/assets/categories/ao-polo.webp';
import aoThun from '@/assets/categories/ao-thun.webp';
import aoLen from '@/assets/categories/ao-len.webp';
import aoKhoac from '@/assets/categories/ao-khoac.webp';
import quanChinos from '@/assets/categories/quan-chinos.webp';
import quanTay from '@/assets/categories/quan-tay.webp';
import quanJeans from '@/assets/categories/quan-jeans.webp';
import quanJogger from '@/assets/categories/quan-jogger.webp';
import quanShort from '@/assets/categories/quan-short.webp';
import phuKien from '@/assets/categories/phu-kien.webp';

/**
 * Default photo of each seeded category on the home page tiles (the photos are listed in THIRD_PARTY_NOTICES.md).
 * A category that is not in this map (for example one an admin adds) keeps the pastel tile with the shirt icon.
 */
export const categoryImages: Record<string, StaticImageData> = {
  'ao-so-mi': aoSoMi,
  'ao-polo': aoPolo,
  'ao-thun': aoThun,
  'ao-len': aoLen,
  'ao-khoac': aoKhoac,
  'quan-chinos': quanChinos,
  'quan-tay': quanTay,
  'quan-jeans': quanJeans,
  'quan-jogger': quanJogger,
  'quan-short': quanShort,
  'phu-kien': phuKien,
};
