-- Week 6 hardening: upload safety review and lifecycle metadata for policy documents.
-- Existing documents remain eligible for retrieval; only new/re-indexed uploads pass the review gate.

ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_status_check;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_status_check
  CHECK (status IN ('uploaded', 'processing', 'ready', 'review', 'failed', 'deleted'));

ALTER TABLE knowledge_document_versions DROP CONSTRAINT IF EXISTS knowledge_document_versions_status_check;
ALTER TABLE knowledge_document_versions
  ADD CONSTRAINT knowledge_document_versions_status_check
  CHECK (status IN ('pending', 'processing', 'ready', 'review', 'failed'));

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS content_kind text NOT NULL DEFAULT 'general'
    CHECK (content_kind IN ('general', 'policy')),
  ADD COLUMN IF NOT EXISTS policy_key text,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS supersedes_document_id uuid REFERENCES knowledge_documents(id),
  ADD CONSTRAINT knowledge_documents_effective_range
    CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE knowledge_document_versions
  ADD COLUMN IF NOT EXISTS safety_status text NOT NULL DEFAULT 'approved'
    CHECK (safety_status IN ('pending_scan', 'needs_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS safety_findings jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS knowledge_document_versions_safety_idx
  ON knowledge_document_versions(document_id, safety_status, version DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_policy_lifecycle_idx
  ON knowledge_documents(policy_key, effective_from, effective_to)
  WHERE content_kind = 'policy' AND deleted_at IS NULL;
