import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildReminder } from './reminders.mjs';

function readConfig() {
  const directory = process.env.CODEX_HOME || join(homedir(), '.codex');
  try {
    return JSON.parse(readFileSync(join(directory, 'skill-reminder.json'), 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('配置必须是 JSON 对象');
  }
  const { enabled = true, skills = {} } = config;
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) {
    throw new TypeError('skills 必须是 JSON 对象');
  }
  const { 'agent-learn': learn = true, 'agent-docs': docs = true } = skills;
  if ([enabled, learn, docs].some(value => typeof value !== 'boolean')) {
    throw new TypeError('配置开关必须使用布尔值');
  }
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  let result = {};
  // Codex 在由 Stop 续接的同一轮传入 stop_hook_active，直接放行。
  if (input?.hook_event_name === 'Stop' && input.stop_hook_active === false) {
    const config = readConfig();
    validateConfig(config);
    const reason = buildReminder(config);
    if (reason) result = { decision: 'block', reason };
  }
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(`skill-reminder 跳过本轮检查：${error.message}\n`);
  process.stdout.write('{}');
}
