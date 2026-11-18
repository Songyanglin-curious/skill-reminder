import Schema from '@deepseek-ai/schemastery';
import { createUserMessage } from '@deepseek-ai/dsh-llm/message';
import { buildReminder } from './reminders.mjs';

export const name = 'skill-reminder';
export const inject = ['agents'];
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用轮末提醒'),
  skills: Schema.object({
    'agent-learn': Schema.boolean().default(true).description('检查学习成果'),
    'agent-docs': Schema.boolean().default(true).description('检查项目 Docs'),
  }).default({}),
});

// 保留同一会话的提醒记录，覆盖 Cordis 重新应用配置的情况。
const lastRemindedTurn = new WeakMap();

export function apply(ctx, config = {}) {
  const text = buildReminder(config);
  if (!text) return;
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
