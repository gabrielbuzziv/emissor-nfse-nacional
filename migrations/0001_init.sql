-- One row per nota; `data` holds the whole record (see `Nota` in src/notas.ts).
CREATE TABLE notas (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX notas_status_created ON notas (status, created_at);
CREATE INDEX notas_created ON notas (created_at);

-- DPS numbers of the series; incremented atomically.
CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
