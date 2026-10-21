-- Twimark の D1。利用者は1人だが、行の持ち主をはっきりさせるため user_id で分ける
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

-- セッション（web）と端末のトークン（device）。値そのものは持たず SHA-256 だけを置く
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('web', 'device')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE login_failures (
  login TEXT NOT NULL,
  failed_at TEXT NOT NULL
);
CREATE INDEX login_failures_login ON login_failures (login, failed_at);

CREATE TABLE categories (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, name)
);

CREATE TABLE subcategories (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, category, name)
);

-- 1件1行。1つの JSON に詰めると D1 の1行の上限にいずれ当たる
CREATE TABLE bookmarks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  posted_at TEXT,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  photos TEXT NOT NULL,
  videos TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
