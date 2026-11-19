import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = join(root, 'dist');
const npm = process.env.npm_execpath;

if (!npm) throw new Error('请使用 npm run pack 打包');

mkdirSync(outputDirectory, { recursive: true });

/** 将通过 Junction 维护的 Skill 和其余发布文件复制到临时目录，供 npm 收录实体文件。 */
function stagePackage(directory) {
  const { files } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const file of ['package.json', 'README.md', '.gitignore', ...files]) {
    const destination = join(directory, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(root, file), destination, { recursive: true, dereference: true });
  }
}

const staging = lstatSync(join(root, 'skills')).isSymbolicLink()
  ? mkdtempSync(join(realpathSync(tmpdir()), 'skill-reminder-pack-'))
  : undefined;
let output;
try {
  if (staging) stagePackage(staging);
  output = execFileSync(process.execPath, [
    npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', outputDirectory,
  ], {
    cwd: staging ?? root,
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} finally {
  if (staging && realpathSync(staging) === staging) rmSync(staging, { recursive: true, force: true });
}
const [{ filename }] = JSON.parse(output);
const tarball = join(outputDirectory, filename);
const checksum = createHash('sha256').update(readFileSync(tarball)).digest('hex');
const checksumFile = join(outputDirectory, 'SHA256SUMS.txt');
writeFileSync(checksumFile, `${checksum}  ${filename}\n`);

console.log(tarball);
console.log(checksumFile);
