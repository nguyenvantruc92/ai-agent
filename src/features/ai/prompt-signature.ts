/**
 * A short description of the tools an agent prompt was written for. Stored when a prompt is generated, and compared with the
 * form's current selection so the admin is told when the tools changed since. Pure, so the form and the server agree on it.
 */
export type SignatureInput = {
  /** Model-facing tool names of the built-in tools. */
  builtin: readonly string[];
  /** Tool names of the knowledge scopes. */
  scopes: readonly string[];
  /** External MCP tools. */
  externals: readonly { serverSlug: string; toolName: string; requiresApproval: boolean }[];
};

export const promptToolsSignature = ({ builtin, scopes, externals }: SignatureInput) => [
  ...builtin.map((name) => `b:${name}`),
  ...scopes.map((name) => `s:${name}`),
  ...externals.map((tool) => `x:${tool.serverSlug}:${tool.toolName}:${tool.requiresApproval ? 'approval' : 'auto'}`),
].sort().join('|');
