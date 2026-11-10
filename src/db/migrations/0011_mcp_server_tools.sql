-- Tools are now ticked on the MCP server itself (selected_tools); an agent just picks which MCP servers it uses and gets every
-- ticked tool of each. selected_tools is an array of { name, requiresApproval }: for the built-in server the model-facing tool
-- names (their confirmation/approval rules stay fixed in code), for external servers the tool names and whether staff must approve.
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS selected_tools jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS agent_mcp_servers (
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  mcp_server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE RESTRICT,
  PRIMARY KEY (agent_id, mcp_server_id)
);
CREATE INDEX IF NOT EXISTS agent_mcp_servers_server_idx ON agent_mcp_servers(mcp_server_id);

-- Carry over what agents had: the servers they used, and the union of the tools they were given on each server.
INSERT INTO agent_mcp_servers (agent_id, mcp_server_id)
  SELECT DISTINCT agent_id, mcp_server_id FROM agent_mcp_tools
  ON CONFLICT DO NOTHING;

UPDATE mcp_servers s SET selected_tools = coalesce((
  SELECT jsonb_agg(jsonb_build_object('name', t.tool_name, 'requiresApproval', t.requires_approval) ORDER BY t.tool_name)
  FROM (SELECT tool_name, bool_or(requires_approval) AS requires_approval FROM agent_mcp_tools WHERE mcp_server_id = s.id GROUP BY tool_name) t
), '[]'::jsonb);

DROP TABLE agent_mcp_tools;
