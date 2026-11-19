import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';

export const configFilename = '.skill-reminder.json';
const emptyConfig = { enabled: true, skills: { 'agent-learn': false, 'agent-docs': false } };

function configPath(cwd) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error('无法确定工作目录');
  const start = realpathSync(cwd);
  for (let folder = start; ; folder = dirname(folder)) {
    if (existsSync(join(folder, '.git'))) return join(folder, configFilename);
    if (dirname(folder) === folder) return join(start, configFilename);
  }
}

// 校验工作区的提醒开关和可选提示词路径。
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('配置必须是 JSON 对象');
  const { enabled = true, skills = {} } = value;
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) throw new TypeError('skills 必须是 JSON 对象');
  const { 'agent-learn': learn = false, 'agent-docs': docs = false } = skills;
  if ([enabled, learn, docs].some(option => typeof option !== 'boolean')) throw new TypeError('配置开关必须使用布尔值');
  const { promptFiles = {} } = value;
  if (!promptFiles || typeof promptFiles !== 'object' || Array.isArray(promptFiles)) {
    throw new TypeError('promptFiles 必须是 JSON 对象');
  }
  for (const name of ['agent-learn', 'agent-docs', 'common']) {
    if (Object.hasOwn(promptFiles, name) && (typeof promptFiles[name] !== 'string' || !promptFiles[name].trim())) {
      throw new TypeError(`promptFiles.${name} 必须是非空的文件路径`);
    }
  }
}

function read(path) {
  try {
    if (!lstatSync(path).isFile()) throw new Error('配置路径必须是普通文件');
    const config = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    validate(config);
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function readWorkspaceConfig(cwd) {
  const path = configPath(cwd);
  return { path, config: read(path) };
}

export function updateWorkspaceConfig(cwd, patch) {
  validate(patch);
  const path = configPath(cwd);
  const lock = path + '.lock';
  const lease = openSync(lock, 'wx');
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    const existing = read(path);
    const config = {
      ...(existing ?? emptyConfig),
      ...patch,
      skills: { ...(existing ? existing.skills : emptyConfig.skills), ...patch.skills },
    };
    if (JSON.stringify(existing) === JSON.stringify(config)) return { path, config, changed: false };
    writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    renameSync(temporary, path);
    return { path, config, changed: true };
  } finally {
    try { rmSync(temporary, { force: true }); }
    finally {
      closeSync(lease);
      rmSync(lock);
    }
  }
}
