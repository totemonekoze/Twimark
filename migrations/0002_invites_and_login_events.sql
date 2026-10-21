-- 招待リンクからの登録と、ログインの履歴（30日）。今いる利用者（いちばん初めの1人）を管理者にする
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member'));
UPDATE users SET role = 'owner' WHERE id = (SELECT min(id) FROM users);

-- 招待。リンクに入れる値そのものは持たず SHA-256 だけを置く。1回きりで、作ってから3日
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TEXT
);

-- ログインの成功と失敗。30日を過ぎた行は、書くたびにその利用者の分を消す
CREATE TABLE login_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  method TEXT NOT NULL CHECK (method IN ('password', 'passkey')),
  client TEXT NOT NULL CHECK (client IN ('web', 'app')),
  reason TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT
);
CREATE INDEX login_events_user_at ON login_events (user_id, at);
