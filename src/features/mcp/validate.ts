import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const validator = new AjvJsonSchemaValidator();
const compiled = new Map<string, ReturnType<typeof validator.getValidator>>();

/** Checks tool arguments against the JSON Schema the MCP server published. Returns an error message, or undefined when valid. */
export function validateToolArgs(schema: unknown, args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'Tham số của tool phải là một object.';
  if (!schema || typeof schema !== 'object' || 'omitted' in (schema as object)) return undefined;
  const key = JSON.stringify(schema);
  let check = compiled.get(key);
  if (!check) {
    try { check = validator.getValidator(schema as never); } catch { return undefined; } // a schema we cannot compile is left to the server
    if (compiled.size > 200) compiled.clear();
    compiled.set(key, check);
  }
  const result = check(args);
  return result.valid ? undefined : `Tham số không hợp lệ: ${result.errorMessage}`;
}
