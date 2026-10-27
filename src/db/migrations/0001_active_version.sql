-- Retrieval reads only the active version, so a re-index in progress (or a failed
-- one) never hides the version that is currently serving chat.
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS active_version_id uuid REFERENCES knowledge_document_versions(id);

UPDATE knowledge_documents d
SET active_version_id = (
  SELECT v.id FROM knowledge_document_versions v
  WHERE v.document_id = d.id AND v.status = 'ready'
  ORDER BY v.version DESC
  LIMIT 1
)
WHERE d.active_version_id IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_chunks_version_idx ON knowledge_chunks(document_version_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_source_id_idx ON knowledge_chunks(source_id);
