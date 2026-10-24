-- アクセントの地の上の文字の色（#RRGGBB、NULL は自動＝白か黒の読みやすいほう）。利用者ごと
ALTER TABLE users ADD COLUMN accent_on TEXT;
