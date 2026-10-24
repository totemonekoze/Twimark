// src/site と src/extension に、両方が使う src/shared を加えて build/site と build/extension に写す。依存パッケージは使わない。
// 一覧の画面には、src/shared/theme.js の値を CSS 変数にした tokens.css も書き出す
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { colors, tones, type, radius, motion } from '../src/shared/theme.js';

const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

// アクセントの色は利用者が選べる。画面（colors.js）が --user-<名前>-l / -d を入れたらそれを使い、なければ既定の値
const ACCENT_KEYS = ['accent', 'onAccent', 'accentText', 'accentSoft', 'accentInk'];

// ライトとダークの変数の組。ダークは端末の設定（prefers-color-scheme）で切り替える
export function tokensCss() {
  const scheme = (i) => [
    ...Object.entries(colors).map(([k, v]) => (ACCENT_KEYS.includes(k) ? `--${kebab(k)}: var(--user-${kebab(k)}-${i ? 'd' : 'l'}, ${v[i]});` : `--${kebab(k)}: ${v[i]};`)),
    ...Object.entries(tones).flatMap(([k, v]) => [`--tone-${k}: ${v[i][0]};`, `--tone-${k}-bg: ${v[i][1]};`]),
  ].map((l) => `  ${l}`).join('\n');
  const shared = [
    ...Object.entries(type).flatMap(([k, [size, line, weight]]) => [`--fs-${kebab(k)}: ${+(size / 17).toFixed(4)}rem;`, `--lh-${kebab(k)}: ${(line / size).toFixed(3)};`, `--fw-${kebab(k)}: ${weight};`]),
    ...Object.entries(radius).map(([k, v]) => `--r-${kebab(k)}: ${v}px;`),
    `--ease: ${motion.ease};`, `--dur: ${motion.duration}ms;`, `--press: ${motion.press};`,
  ].map((l) => `  ${l}`).join('\n');
  return `/* src/shared/theme.js から scripts/build.mjs が書き出す。手で直さない */
:root {
  color-scheme: light dark;
${shared}
${scheme(0)}
}
@media (prefers-color-scheme: dark) {
  :root {
${scheme(1).replace(/^/gm, '  ')}
  }
}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  rmSync(`${root}build`, { recursive: true, force: true });
  for (const app of ['site', 'extension']) {
    cpSync(`${root}src/${app}`, `${root}build/${app}`, { recursive: true });
    cpSync(`${root}src/shared`, `${root}build/${app}/shared`, { recursive: true });
  }
  writeFileSync(`${root}build/site/tokens.css`, tokensCss());
  console.log('build/site と build/extension を作りました。');
  // 拡張は src/extension（shared/ がない）でも build でもなく、このフォルダーを読み込む
  console.log(`拡張は次のフォルダーを読み込む: ${fileURLToPath(new URL('../build/extension', import.meta.url))}`);
}
