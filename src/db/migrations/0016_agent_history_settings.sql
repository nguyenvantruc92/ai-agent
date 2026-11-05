-- Week 8 Phase 7: conversation-history settings per agent. NULL = use the env default (AGENT_SUMMARY_ENABLED,
-- AGENT_SUMMARIZE_AFTER_MESSAGES, AGENT_KEEP_RECENT_MESSAGES), so existing agents keep their behaviour and a rollback
-- is setting the columns back to NULL.
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS summary_enabled boolean;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS summarize_after_messages integer;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS keep_recent_messages integer;

ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_history_settings_check;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_history_settings_check CHECK (
  (summarize_after_messages IS NULL OR summarize_after_messages BETWEEN 8 AND 200)
  AND (keep_recent_messages IS NULL OR keep_recent_messages BETWEEN 4 AND 100)
  AND (summarize_after_messages IS NULL OR keep_recent_messages IS NULL OR summarize_after_messages > keep_recent_messages)
);
