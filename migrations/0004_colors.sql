-- 色の設定。アクセントは利用者ごと（#RRGGBB、NULL は既定）、カテゴリの色はカテゴリごと（決まった色の名前か #RRGGBB、NULL は並び順）
ALTER TABLE users ADD COLUMN accent TEXT;
ALTER TABLE categories ADD COLUMN color TEXT;
