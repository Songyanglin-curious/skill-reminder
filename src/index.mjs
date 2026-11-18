import Schema from '@deepseek-ai/schemastery';
import { createUserMessage } from '@deepseek-ai/dsh-llm/message';

export const name = 'skill-reminder';
export const inject = ['agents'];
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用轮末提醒'),
  skills: Schema.object({
    'agent-learn': Schema.boolean().default(true).description('检查学习成果'),
    'agent-docs': Schema.boolean().default(true).description('检查项目 Docs'),
  }).default({}),
});

const reminders = {
  'agent-learn': '如本轮产生了需要持久化的学习成果，按 agent-learn Skill 检查专题计划、进度和阶段或专题成果是否需要补记。',
  'agent-docs': '如本轮有值得保存的项目事实、设计决策、长期约定或知识，按 agent-docs Skill 检查相关 Docs 是否需要维护。',
};
// 保留同一会话的提醒记录，覆盖 Cordis 重新应用配置的情况。
const lastRemindedTurn = new WeakMap();

export function apply(ctx, config = {}) {
  if (config.enabled === false) return;
  const enabledReminders = Object.entries(reminders)
    .filter(([skill]) => config.skills?.[skill] !== false)
    .map(([, reminder]) => reminder);
  if (enabledReminders.length === 0) return;

  const text = [
    ...enabledReminders,
    '优先复用上下文中已掌握的规则，仅在缺少必要规则且本轮适用时加载。没有实质变化或已经记录时直接结束。',
  ].join('\n');
  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    if (signal.aborted) return;
    const { session } = agent;
    if (session.header.origin === 'subagent' || session.header.delegationDepth > 0) return;
    if (turn <= (lastRemindedTurn.get(session) ?? -1)) return;

    // steer 会让当前轮继续运行，并再次进入停止阶段。
    lastRemindedTurn.set(session, turn);
    try {
      agent.steer(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'skill-reminder', form: 'instructions' },
      }));
    } catch (error) {
      ctx.logger.warn(`skill-reminder 投递失败：${error.message}`);
    }
  });
}
