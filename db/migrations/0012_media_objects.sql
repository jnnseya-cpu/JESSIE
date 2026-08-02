-- ============================================================
-- 0012 — Profile media that survives the instance it was uploaded to.
--
-- 0005 added the pointers; the pixels were expected to live in object
-- storage. With no Blob store connected the storage service fell back to
-- a Map inside one serverless instance: the upload returned 201 with a
-- URL, and the very next request — served by a different instance —
-- answered 404. To the member the picture uploads, never appears, and is
-- gone on reload.
--
-- A database the platform already requires is a better floor than a
-- service it might not have. Blob is still preferred when its token is
-- present; this is what happens when it is not.
--
-- An avatar is capped at 5 MB and a cover at 10 MB by the upload rules,
-- and both are stripped of metadata before they arrive here.
-- ============================================================

CREATE TABLE IF NOT EXISTS media_objects (
  key           text PRIMARY KEY,
  content_type  text NOT NULL,
  bytes         bytea NOT NULL,
  byte_size     integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_objects_created_idx ON media_objects (created_at DESC);
