import { env } from '@/lib/env';

/** `aliases`: other accepted IDs with the same label (e.g. `gpt-4.1` and its dated snapshot), shown as one choice. */
export type ModelOption = { id: string; label: string; aliases?: string[] };

/** Models supported by this agent's Responses API + function-calling integration. */
const builtInModels: ModelOption[] = [
  { id: 'gpt-4.1', label: 'GPT 4.1' },
  { id: 'gpt-4.1-mini', label: 'GPT 4.1 mini' },
  { id: 'gpt-4.1-nano', label: 'GPT 4.1 nano' },
  { id: 'gpt-4o', label: 'GPT 4o' },
  { id: 'gpt-4o-mini', label: 'GPT 4o mini' },
];

const snapshotLabels: Record<string, string> = {
  'gpt-4.1-2025-04-14': 'GPT 4.1',
  'gpt-4.1-mini-2025-04-14': 'GPT 4.1 mini',
  'gpt-4.1-nano-2025-04-14': 'GPT 4.1 nano',
  'gpt-4o-2024-08-06': 'GPT 4o',
  'gpt-4o-mini-2024-07-18': 'GPT 4o mini',
};

/** The built-in choices plus any explicitly configured compatible model IDs. */
export function allowedModels() {
  const extra = env.OPENAI_ALLOWED_MODELS.split(',').map((item) => item.trim()).filter(Boolean);
  return [...new Set([...builtInModels.map((model) => model.id), env.OPENAI_CHAT_MODEL, ...extra])];
}

/** Friendly names for the admin UI; raw provider IDs never need to be shown to an admin. */
export function modelLabel(id: string) {
  return builtInModels.find((model) => model.id === id)?.label ?? snapshotLabels[id] ?? id;
}

/** One option per label. When an alias and a dated snapshot share a label, the configured/extra ID (usually what agents already store) wins. */
export function modelOptions(): ModelOption[] {
  const builtIn = new Set(builtInModels.map((model) => model.id));
  const byLabel = new Map<string, ModelOption>();
  for (const id of allowedModels()) {
    const label = modelLabel(id);
    const existing = byLabel.get(label);
    if (!existing) { byLabel.set(label, { id, label }); continue; }
    const preferNew = builtIn.has(existing.id) && !builtIn.has(id);
    byLabel.set(label, preferNew ? { id, label, aliases: [...(existing.aliases ?? []), existing.id] } : { ...existing, aliases: [...(existing.aliases ?? []), id] });
  }
  return [...byLabel.values()];
}
