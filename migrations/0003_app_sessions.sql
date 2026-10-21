-- アプリのトークン。アプリへの受け渡しと、device 付きのログインで作るものを 1 にする。
-- 1 のトークンは設定の操作（パスキーの登録を除く）もできる。拡張のトークン（設定で発行したもの）は 0 のまま
ALTER TABLE sessions ADD COLUMN app INTEGER NOT NULL DEFAULT 0;
