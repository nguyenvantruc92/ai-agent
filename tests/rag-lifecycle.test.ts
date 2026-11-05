import { describe, expect, it } from 'vitest';
import { filterPolicyLifecycle } from '@/features/rag/retrieval';
import type { DbChunk } from '@/db/client';

const policy = (id: string, metadata: Record<string, unknown>): DbChunk => ({ id, source_id: id, source_type: 'policy', title: id, content: id, metadata, similarity: 0.9 });

describe('policy lifecycle resolver', () => {
  it('drops documents that are not effective today', () => {
    const result = filterPolicyLifecycle([
      policy('expired', { policy_key: 'returns', document_id: 'old', effective_to: '2000-01-01' }),
      policy('future', { policy_key: 'returns', document_id: 'future', effective_from: '2999-01-01' }),
      policy('current', { policy_key: 'returns', document_id: 'current', effective_from: '2020-01-01' }),
    ], true);
    expect(result.allowed).toEqual(new Set(['current']));
    expect(result.filters).toMatchObject({ expired: 1, future: 1 });
  });

  it('fails closed when two equally-current policy documents conflict', () => {
    const result = filterPolicyLifecycle([
      policy('a', { policy_key: 'shipping', document_id: 'a', effective_from: '2025-01-01' }),
      policy('b', { policy_key: 'shipping', document_id: 'b', effective_from: '2025-01-01' }),
    ], true);
    expect(result.allowed.size).toBe(0);
    expect(result.filters.conflicts).toEqual(['shipping']);
  });

  it('keeps the newest policy document in a lifecycle group', () => {
    const result = filterPolicyLifecycle([
      policy('old', { policy_key: 'shipping', document_id: 'old-doc', effective_from: '2025-01-01' }),
      policy('new', { policy_key: 'shipping', document_id: 'new-doc', effective_from: '2026-01-01', supersedes_document_id: 'old-doc' }),
    ], true);
    expect(result.allowed).toEqual(new Set(['new']));
  });
});
