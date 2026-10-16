import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { DATA_DIR } from "./config"

type DB = Database.Database

const globalForDb = globalThis as unknown as { __hzdockDb?: DB }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One Hetzner Cloud project: its name and its (encrypted) API token.
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  server_id INTEGER NOT NULL,
  label TEXT,
  nickname TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, server_id)
);
CREATE INDEX IF NOT EXISTS assignments_server ON assignments(project_id, server_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  project_id INTEGER,
  server_id INTEGER,
  server_name TEXT,
  detail TEXT,
  status INTEGER,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS audit_logs_at ON audit_logs(at);

-- SSH keys the panel adds to a project for one rescue boot, removed again later.
CREATE TABLE IF NOT EXISTS temp_ssh_keys (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, key_id)
);
`

/**
 * Schema changes after the first release, applied in order and recorded in
 * user_version. Never edit one that has shipped; add a new one at the end.
 */
const MIGRATIONS: ((db: DB) => void)[] = [
  // 1. Dedicated servers from Hetzner Robot. A Robot account is a webservice user and its
  // (encrypted) password. A dedicated server's number can equal a cloud server's ID, so
  // assignments and the activity log now say which kind of server they mean. For
  // dedicated servers project_id holds the Robot account, which is why it can no longer
  // be a foreign key: deleting a project or an account removes its assignments in code.
  (db) => {
    db.exec(`
      CREATE TABLE robot_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- SSH keys the panel adds to a Robot account for one boot, removed again later.
      CREATE TABLE robot_temp_keys (
        account_id INTEGER NOT NULL REFERENCES robot_accounts(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, fingerprint)
      );

      CREATE TABLE assignments_new (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('cloud', 'dedicated')),
        project_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        label TEXT,
        nickname TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, kind, project_id, server_id)
      );
      INSERT INTO assignments_new (user_id, kind, project_id, server_id, label, nickname, created_at)
        SELECT user_id, 'cloud', project_id, server_id, label, nickname, created_at FROM assignments;
      DROP TABLE assignments;
      ALTER TABLE assignments_new RENAME TO assignments;
      CREATE INDEX assignments_server ON assignments(kind, project_id, server_id);

      ALTER TABLE audit_logs ADD COLUMN server_kind TEXT;
      UPDATE audit_logs SET server_kind = 'cloud' WHERE server_id IS NOT NULL;
    `)
  },
  // 2. Storage Boxes of a Hetzner project can be assigned like servers (kind 'storage').
  (db) => {
    db.exec(`
      CREATE TABLE assignments_new (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('cloud', 'dedicated', 'storage')),
        project_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        label TEXT,
        nickname TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, kind, project_id, server_id)
      );
      INSERT INTO assignments_new SELECT user_id, kind, project_id, server_id, label, nickname, created_at FROM assignments;
      DROP TABLE assignments;
      ALTER TABLE assignments_new RENAME TO assignments;
      CREATE INDEX assignments_server ON assignments(kind, project_id, server_id);
    `)
  },
  // 3. DNS zones of a Hetzner project can be assigned like servers (kind 'dns').
  (db) => {
    db.exec(`
      CREATE TABLE assignments_new (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('cloud', 'dedicated', 'storage', 'dns')),
        project_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        label TEXT,
        nickname TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, kind, project_id, server_id)
      );
      INSERT INTO assignments_new SELECT user_id, kind, project_id, server_id, label, nickname, created_at FROM assignments;
      DROP TABLE assignments;
      ALTER TABLE assignments_new RENAME TO assignments;
      CREATE INDEX assignments_server ON assignments(kind, project_id, server_id);
    `)
  },
]

function migrate(db: DB) {
  const version = db.pragma("user_version", { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

function open(): DB {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const db = new Database(path.join(/*turbopackIgnore: true*/ DATA_DIR, "hzdock.db"))
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  db.exec(SCHEMA)
  migrate(db)
  // Drop expired sessions on start.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now())
  return db
}

export function db(): DB {
  if (!globalForDb.__hzdockDb) globalForDb.__hzdockDb = open()
  return globalForDb.__hzdockDb
}
