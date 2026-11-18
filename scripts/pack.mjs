import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = join(root, 'dist');
const npm = process.env.npm_execpath;

if (!npm) throw new Error('请使用 npm run pack 打包');

mkdirSync(outputDirectory, { recursive: true });
const output = execFileSync(process.execPath, [
  npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', outputDirectory,
], {
  cwd: root,
  encoding: 'utf8',
  timeout: 60_000,
  stdio: ['ignore', 'pipe', 'inherit'],
});
const [{ filename }] = JSON.parse(output);
const tarball = join(outputDirectory, filename);
const checksum = createHash('sha256').update(readFileSync(tarball)).digest('hex');
const checksumFile = join(outputDirectory, 'SHA256SUMS.txt');
writeFileSync(checksumFile, `${checksum}  ${filename}\n`);

console.log(tarball);
console.log(checksumFile);
