import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readWorkspaceConfig } from './workspace-config.mjs';

const reminderSkills = ['agent-learn', 'agent-docs'];

// 读取工作区指定的文案，未指定时读取随插件分发的默认文案。
function readPrompt(name, configPath, promptFiles) {
  const override = promptFiles?.[name];
  const file = override === undefined
    ? new URL(`../prompts/${name}.md`, import.meta.url)
    : resolve(dirname(configPath), override);
  const text = readFileSync(file, 'utf8').trim();
  if (!text) throw new Error(`提示词文件为空：${file}`);
  return text;
}

// 按工作区开关组合 Skill 文案和通用说明。
function buildReminder(configPath, config = {}) {
  if (config.enabled === false) return;
  const enabledSkills = reminderSkills.filter(skill => config.skills?.[skill] === true);
  if (enabledSkills.length === 0) return;

  return [...enabledSkills, 'common']
    .map(name => readPrompt(name, configPath, config.promptFiles))
    .join('\n');
}

// 定位工作区配置并生成本轮的合并提醒。
export function reminderForWorkspace(cwd) {
  const { path, config } = readWorkspaceConfig(cwd);
  return buildReminder(path, config);
}
