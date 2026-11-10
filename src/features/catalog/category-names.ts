import { sql } from '@/db/client';

const TTL_MS = 60_000;
let cache: { names: Promise<string[]>; expiresAt: number } | undefined;

/**
 * Names of the active categories, for spotting a category named in a chat question. Cached for a minute; category writes
 * in this process call `invalidateCategoryNames`, and the TTL covers writes from other processes (seed, migrate).
 */
export function activeCategoryNames(): Promise<string[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.names;
  const entry = {
    names: sql<{ name: string }[]>`SELECT name FROM categories WHERE is_active ORDER BY sort_order, name`.then((rows) => rows.map((row) => row.name)),
    expiresAt: Date.now() + TTL_MS,
  };
  // A failed load must not stay cached; a newer entry may already have replaced this one.
  entry.names.catch(() => { if (cache === entry) cache = undefined; });
  cache = entry;
  return entry.names;
}

export function invalidateCategoryNames() {
  cache = undefined;
}
