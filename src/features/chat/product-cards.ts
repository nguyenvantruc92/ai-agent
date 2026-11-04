import { listStoreCardsByCodes, type StoreCard } from '@/features/catalog/queries';

const MAX_CARDS = 5;

/**
 * Product boxes shown under an assistant answer: the products the answer cites (`product:<code>` sources), read live from the
 * catalogue so price, stock and image are current even for an old message. Hidden or deleted products are skipped.
 */
export async function productCardsForSources(sources: { id: string }[] | undefined): Promise<StoreCard[]> {
  const codes = [...new Set((sources ?? []).flatMap((source) => /^product:(.+)$/.exec(source.id)?.[1] ?? []))].slice(0, MAX_CARDS);
  return codes.length ? listStoreCardsByCodes(codes) : [];
}
