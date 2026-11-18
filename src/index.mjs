import { createUserMessage } from '@deepseek-ai/dsh-llm/message';
import { reminderForWorkspace } from './reminders.mjs';
import { readWorkspaceConfig, updateWorkspaceConfig } from './workspace-config.mjs';

export const name = 'skill-reminder';
export const inject = ['agents', 'tools'];

// 保留同一会话的提醒记录，覆盖 Cordis 重新应用配置的情况。
const lastRemindedTurn = new WeakMap();

export function apply(ctx) {
  ctx.tools.register({
    name: 'skill_reminder_config',
    description: '查看当前工作区的 skill-reminder 提醒开关。只有用户明确要求调整时才传开关并保存 .skill-reminder.json；不传开关时只查询。「只开启学习提醒」传 enabled=true、learn=true、docs=false。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean', description: '工作区总开关' },
        learn: { type: 'boolean', description: 'agent-learn 提醒开关' },
        docs: { type: 'boolean', description: 'agent-docs 提醒开关' },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    async execute({ enabled, learn, docs }, { agent, signal }) {
      signal?.throwIfAborted();
      const cwd = agent?.session?.header.cwd;
      if (enabled === undefined && learn === undefined && docs === undefined) {
        const { path, config } = readWorkspaceConfig(cwd);
        return { path, config: config ?? null };
      }
      return updateWorkspaceConfig(cwd, {
        ...(enabled === undefined ? {} : { enabled }),
        skills: {
          ...(learn === undefined ? {} : { 'agent-learn': learn }),
          ...(docs === undefined ? {} : { 'agent-docs': docs }),
        },
      });
    },
  });

  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    if (signal.aborted) return;
    const { session } = agent;
    if (session.header.origin === 'subagent' || session.header.delegationDepth > 0) return;
    if (turn <= (lastRemindedTurn.get(session) ?? -1)) return;

    // steer 会让当前轮继续运行，并再次进入停止阶段。
    lastRemindedTurn.set(session, turn);
    try {
      const text = reminderForWorkspace(session.header.cwd);
      if (!text) return;
      agent.steer(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'skill-reminder', form: 'instructions' },
      }));
    } catch (error) {
      ctx.logger.warn(`skill-reminder 投递失败：${error.message}`);
    }
  });
}
