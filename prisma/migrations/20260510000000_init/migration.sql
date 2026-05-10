-- Enable the pgvector extension. The local and production Postgres images
-- are pgvector-enabled (pgvector/pgvector:0.8.2-pg17-trixie), so this only
-- registers the extension in the configured database; no extension
-- installation happens at migrate time.
CREATE EXTENSION IF NOT EXISTS vector;
