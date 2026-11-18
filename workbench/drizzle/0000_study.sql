CREATE TABLE study_items (
  owner TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (owner, kind, id)
);
