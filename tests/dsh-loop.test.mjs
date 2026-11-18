import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import Agents from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import * as plugin from '../src/index.mjs';

class OfflineAdapter extends LlmAdapter {
  requests = [];

  async resolveModel(provider, model) {
    return { provider, id: model, name: model };
  }

  async *stream(request) {
    this.requests.push(request);
    assert.ok(this.requests.length <= 3, '轮末提醒不应持续续接');
    const block = { type: 'text', text: '完成' };
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: block.text };
    yield { type: 'block-end', index: 0, block };
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

async function runTurn(ctx, agent, text) {
  const idle = new Promise(resolve => {
    const off = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        off();
        resolve();
      }
    });
  });
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }));
  await idle;
  const end = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end');
  assert.equal(end?.data.reason?.kind, 'completed', JSON.stringify(end?.data));
}

test('实际 DSH AgentLoop 配置工具可用，同一轮只续接一次，卸载后放行', { timeout: 10_000 }, async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-reminder-loop-'));
  t.after(() => {
    rmSync(join(cwd, '.skill-reminder.json'), { force: true });
    rmdirSync(cwd);
  });
  const ctx = new Context();
  try {
    for (const service of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, Tools, Agents]) {
      await ctx.plugin(service);
    }
    ctx.tools.setExecutor({
      describe: () => ({ schemas: [] }),
      execute: () => assert.fail('离线模型不会发出工具调用'),
    });
    await ctx.plugin(AgentLoop, { agents: [] });
    const adapter = new OfflineAdapter();
    ctx.llm.registerAdapter(['offline'], adapter);
    const fiber = ctx.plugin(plugin, {});
    await fiber;
    const agent = await ctx.agentLoop.create(SessionId('skill-reminder-test'), {
      provider: 'offline',
      model: 'offline',
    }, { cwd });
    const configTool = ctx.tools.get('skill_reminder_config');
    const config = await configTool.execute({ learn: true, docs: true }, { agent });
    assert.equal(config.changed, true);

    await runTurn(ctx, agent, '完成本轮');
    const events = agent.session.snapshotEvents();
    const reminders = events.filter(event =>
      event.type === 'user/message' && event.data.source?.kind === 'skill-reminder');
    assert.equal(events.filter(event => event.type === 'turn/start').length, 1);
    assert.equal(reminders.length, 1);
    assert.equal(adapter.requests.length, 2);

    await fiber.dispose();
    await runTurn(ctx, agent, '下一轮');
    assert.equal(adapter.requests.length, 3);
  } finally {
    await ctx.fiber.dispose();
  }
});
