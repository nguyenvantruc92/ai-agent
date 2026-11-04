-- AI Agents, Knowledge scopes and the MCP server registry. Seed rows (default agent, built-in server, "Chính sách" scope)
-- are created idempotently by src/features/ai/seed.ts because they need the prompt files and environment.

CREATE TABLE IF NOT EXISTS ai_agents (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  model text NOT NULL,
  temperature numeric(3, 2) NOT NULL DEFAULT 0.3 CHECK (temperature BETWEEN 0 AND 2),
  max_steps integer NOT NULL DEFAULT 5 CHECK (max_steps BETWEEN 1 AND 20),
  max_tool_calls integer NOT NULL DEFAULT 5 CHECK (max_tool_calls BETWEEN 1 AND 20),
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_default OR (is_active AND archived_at IS NULL))
);
-- Exactly one default agent.
CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_one_default ON ai_agents(is_default) WHERE is_default;

-- A knowledge scope is exposed to the model as one tool: tool_name + tool_description decide when it is called.
CREATE TABLE IF NOT EXISTS knowledge_scopes (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  tool_name text NOT NULL UNIQUE CHECK (tool_name ~ '^[a-z][a-z0-9_]{2,40}$'),
  tool_description text NOT NULL,
  -- Also search the shipping-policy chunk that the system generates from Cài đặt (it is not a file an admin can assign).
  include_system_policy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_scope_documents (
  scope_id uuid NOT NULL REFERENCES knowledge_scopes(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id, document_id)
);
CREATE INDEX IF NOT EXISTS knowledge_scope_documents_document_idx ON knowledge_scope_documents(document_id);

CREATE TABLE IF NOT EXISTS agent_knowledge_scopes (
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  scope_id uuid NOT NULL REFERENCES knowledge_scopes(id) ON DELETE RESTRICT,
  PRIMARY KEY (agent_id, scope_id)
);
CREATE INDEX IF NOT EXISTS agent_knowledge_scopes_scope_idx ON agent_knowledge_scopes(scope_id);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9_]{1,30}$'),
  url text NOT NULL,
  auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'header')),
  auth_header_name text,
  auth_secret_encrypted text,
  auth_hint text,
  is_builtin boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_status text CHECK (last_status IN ('ok', 'error')),
  last_error text,
  tools_cache jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mcp_servers_one_builtin ON mcp_servers(is_builtin) WHERE is_builtin;

-- Explicit allowlist: which tool of which MCP server an agent may call.
CREATE TABLE IF NOT EXISTS agent_mcp_tools (
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  mcp_server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE RESTRICT,
  tool_name text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  PRIMARY KEY (agent_id, mcp_server_id, tool_name)
);
CREATE INDEX IF NOT EXISTS agent_mcp_tools_server_idx ON agent_mcp_tools(mcp_server_id);

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES ai_agents(id) ON DELETE RESTRICT;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS chat_threads_agent_idx ON chat_threads(agent_id);
