import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/db/client';
import { reservedToolNames } from '@/features/agent/tools';
import { agentForThread, agentScopes, invalidateAgentCache } from '@/features/ai/agents';
import { catalogMime } from '@/features/catalog/sync';
import { retrieve, type RetrievalScope } from '@/features/rag/retrieval';
import { HttpError } from '@/lib/http';

export const scopeInput = z.object({
  name: z.string().trim().min(2, 'Tên scope cần ít nhất 2 ký tự.').max(80, 'Tên scope tối đa 80 ký tự.'),
  toolName: z.string().trim()
    .regex(/^[a-z][a-z0-9_]{2,40}$/, 'Tên tool gồm chữ thường, số, dấu gạch dưới; bắt đầu bằng chữ; 3–41 ký tự.')
    .refine((value) => !value.includes('__'), 'Tên tool không được chứa hai dấu gạch dưới liên tiếp (dành cho tool của MCP server ngoài).')
    .refine((value) => !reservedToolNames.has(value), 'Tên tool này trùng với tool có sẵn của hệ thống.'),
  description: z.string().trim().min(20, 'Mô tả tool cần ít nhất 20 ký tự để model biết khi nào nên dùng.').max(1000, 'Mô tả tool tối đa 1000 ký tự.'),
  documentIds: z.array(z.string().uuid()).max(100).default([]),
  includeSystemPolicy: z.boolean().default(false),
});
export type ScopeInput = z.infer<typeof scopeInput>;

export type ScopeRow = {
  id: string; name: string; tool_name: string; tool_description: string; include_system_policy: boolean; created_at: string; updated_at: string;
};
export type ScopeSummary = ScopeRow & { document_count: number; agents: { id: string; name: string }[] };
export type ScopeDocument = { id: string; original_filename: string; status: string };

export async function listScopes(): Promise<ScopeSummary[]> {
  const rows = await sql<(ScopeRow & { document_count: number; agents: { id: string; name: string }[] })[]>`
    SELECT s.*,
      (SELECT count(*)::int FROM knowledge_scope_documents sd JOIN knowledge_documents d ON d.id = sd.document_id AND d.deleted_at IS NULL WHERE sd.scope_id = s.id) AS document_count,
      coalesce((SELECT json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name)
        FROM agent_knowledge_scopes ak JOIN ai_agents a ON a.id = ak.agent_id WHERE ak.scope_id = s.id AND a.archived_at IS NULL), '[]'::json) AS agents
    FROM knowledge_scopes s ORDER BY s.name
  `;
  return rows;
}

export async function getScope(id: string) {
  const [scope] = await sql<ScopeRow[]>`SELECT * FROM knowledge_scopes WHERE id = ${id}`;
  if (!scope) return undefined;
  const documents = await sql<ScopeDocument[]>`
    SELECT d.id, d.original_filename, d.status FROM knowledge_scope_documents sd
    JOIN knowledge_documents d ON d.id = sd.document_id AND d.deleted_at IS NULL
    WHERE sd.scope_id = ${id} ORDER BY d.original_filename
  `;
  const agents = await sql<{ id: string; name: string }[]>`
    SELECT a.id, a.name FROM agent_knowledge_scopes ak JOIN ai_agents a ON a.id = ak.agent_id WHERE ak.scope_id = ${id} AND a.archived_at IS NULL ORDER BY a.name
  `;
  return { ...scope, documents, agents };
}

/** Files an admin may put in a scope: uploaded knowledge files, never the catalog document that backs product search. */
export const assignableDocuments = () => sql<ScopeDocument[]>`
  SELECT id, original_filename, status FROM knowledge_documents WHERE deleted_at IS NULL AND mime_type <> ${catalogMime} ORDER BY original_filename
`;

async function assertAssignable(documentIds: string[]) {
  if (!documentIds.length) return;
  const rows = await sql<{ id: string }[]>`SELECT id FROM knowledge_documents WHERE id = ANY(${sql.array(documentIds, 2950)}::uuid[]) AND deleted_at IS NULL AND mime_type <> ${catalogMime}`;
  if (rows.length !== new Set(documentIds).size) throw new HttpError('Có tài liệu không tồn tại hoặc không thể đưa vào scope (catalog sản phẩm dùng tool tìm sản phẩm riêng).', 400);
}

export async function createScope(input: ScopeInput) {
  await assertAssignable(input.documentIds);
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO knowledge_scopes (id, name, tool_name, tool_description, include_system_policy) VALUES (${id}, ${input.name}, ${input.toolName}, ${input.description}, ${input.includeSystemPolicy})`;
    for (const documentId of new Set(input.documentIds)) await tx`INSERT INTO knowledge_scope_documents (scope_id, document_id) VALUES (${id}, ${documentId})`;
  });
  invalidateAgentCache();
  return id;
}

export async function updateScope(id: string, input: ScopeInput) {
  if (!(await getScope(id))) throw new HttpError('Không tìm thấy scope.', 404);
  await assertAssignable(input.documentIds);
  await sql.begin(async (tx) => {
    await tx`
      UPDATE knowledge_scopes SET name = ${input.name}, tool_name = ${input.toolName}, tool_description = ${input.description},
        include_system_policy = ${input.includeSystemPolicy}, updated_at = now() WHERE id = ${id}
    `;
    await tx`DELETE FROM knowledge_scope_documents WHERE scope_id = ${id}`;
    for (const documentId of new Set(input.documentIds)) await tx`INSERT INTO knowledge_scope_documents (scope_id, document_id) VALUES (${id}, ${documentId})`;
  });
  invalidateAgentCache();
}

/** Refuses while an agent still uses the scope and names those agents, so nothing loses a tool unexpectedly. */
export async function deleteScope(id: string) {
  const scope = await getScope(id);
  if (!scope) throw new HttpError('Không tìm thấy scope.', 404);
  if (scope.agents.length) throw new HttpError(`Scope đang được dùng bởi Agent: ${scope.agents.map((agent) => agent.name).join(', ')}. Gỡ scope khỏi Agent trước khi xóa.`, 409);
  await sql`DELETE FROM knowledge_scopes WHERE id = ${id}`;
  invalidateAgentCache();
}

/** Which scopes each document belongs to (for the Files tab). */
export async function scopesByDocument() {
  const rows = await sql<{ document_id: string; id: string; name: string }[]>`
    SELECT sd.document_id, s.id, s.name FROM knowledge_scope_documents sd JOIN knowledge_scopes s ON s.id = sd.scope_id ORDER BY s.name
  `;
  const map = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) map.set(row.document_id, [...(map.get(row.document_id) ?? []), { id: row.id, name: row.name }]);
  return map;
}

async function scopeRetrieval(scopeId: string): Promise<RetrievalScope> {
  const [scope] = await sql<{ include_system_policy: boolean }[]>`SELECT include_system_policy FROM knowledge_scopes WHERE id = ${scopeId}`;
  const documents = await sql<{ document_id: string }[]>`SELECT document_id FROM knowledge_scope_documents WHERE scope_id = ${scopeId}`;
  return { documentIds: documents.map((row) => row.document_id), includeSystemPolicy: scope?.include_system_policy ?? false };
}

/** Admin test: what a question would retrieve from this scope alone. */
export async function testScopeRetrieval(scopeId: string, message: string, traceId: string) {
  if (!(await getScope(scopeId))) throw new HttpError('Không tìm thấy scope.', 404);
  return retrieve({ query: message, message, traceId, scope: await scopeRetrieval(scopeId) });
}

/**
 * The `search_knowledge` MCP tool. The scope must be enabled for the agent that owns the thread, so a model cannot reach
 * a scope its agent was not given just by naming it.
 */
export async function searchScopeForThread(threadId: string, scopeToolName: string, query: string, traceId: string) {
  const agent = await agentForThread(threadId);
  const scope = (await agentScopes(agent.id)).find((item) => item.toolName === scopeToolName);
  if (!scope) throw new HttpError(`Scope "${scopeToolName}" không được bật cho Agent này.`, 403);
  const { chunks } = await retrieve({ query, message: query, traceId, scope: await scopeRetrieval(scope.id) });
  return chunks.map((chunk) => ({ source_id: chunk.source_id, title: chunk.title, content: chunk.content, similarity: Number(chunk.similarity.toFixed(4)), updated_at: String(chunk.metadata.updated_at ?? '') }));
}
