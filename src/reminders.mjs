import { readWorkspaceConfig } from './workspace-config.mjs';

const reminders = {
  'agent-learn': '如本轮产生了需要持久化的学习成果，按 agent-learn Skill 检查专题计划、进度和阶段或专题成果是否需要补记。',
  'agent-docs': '如本轮有值得保存的项目事实、设计决策、长期约定或知识，按 agent-docs Skill 检查相关 Docs 是否需要维护。',
};

function buildReminder(config = {}) {
  if (config.enabled === false) return;
  const enabledReminders = Object.entries(reminders)
    .filter(([skill]) => config.skills?.[skill] === true)
    .map(([, reminder]) => reminder);
  if (enabledReminders.length === 0) return;

  return [
    ...enabledReminders,
    '优先复用上下文中已掌握的规则，仅在缺少必要规则且本轮适用时加载。没有实质变化或已经记录时直接结束。',
  ].join('\n');
}
export function reminderForWorkspace(cwd) {
  const { config } = readWorkspaceConfig(cwd);
  return buildReminder(config);
}
