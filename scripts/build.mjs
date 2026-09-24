// src/site と src/extension に、両方が使う src/shared を加えて build/site と build/extension に写す。依存パッケージは使わない
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
rmSync(`${root}build`, { recursive: true, force: true });
for (const app of ['site', 'extension']) {
  cpSync(`${root}src/${app}`, `${root}build/${app}`, { recursive: true });
  cpSync(`${root}src/shared`, `${root}build/${app}/shared`, { recursive: true });
}
console.log('build/site と build/extension を作りました。');
