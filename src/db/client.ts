import postgres from 'postgres';
import { env } from '@/lib/env';

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export type DbChunk = {
  id: string;
  source_id: string;
  source_type: 'product' | 'policy';
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};
