import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'dist', 'codex', 'skill-reminder');
const files = [
  ['codex-plugin/.codex-plugin/plugin.json', '.codex-plugin/plugin.json'],
  ['codex-plugin/hooks/hooks.json', 'hooks/hooks.json'],
  ['src/codex-stop.mjs', 'src/codex-stop.mjs'],
  ['src/reminders.mjs', 'src/reminders.mjs'],
  ['config.example.json', 'config.example.json'],
];

for (const [source, relativeTarget] of files) {
  const target = join(destination, relativeTarget);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, source), target);
}
console.log(destination);
