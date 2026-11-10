-- Approvals may now also cover a call to an external MCP tool that an admin marked "needs staff approval" for an agent.
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_action_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_action_check CHECK (action IN ('exchange_size', 'return', 'mcp_tool'));
