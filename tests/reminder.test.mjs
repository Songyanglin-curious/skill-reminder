import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { apply } from '../src/index.mjs';
import { configFilename } from '../src/workspace-config.mjs';

const all = { skills: { 'agent-learn': true, 'agent-docs': true } };

function fixture(t, config = all) {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-reminder-dsh-'));
  const path = join(cwd, configFilename);
  t.after(() => {
    rmSync(path, { force: true });
    rmdirSync(cwd);
  });
  const write = data => writeFileSync(path, JSON.stringify(data));
  if (config !== null) write(config);
  const handlers = new Map();
  const warnings = [];
  let tool;
  apply({
    on: (event, listener) => handlers.set(event, listener),
    logger: { warn: message => warnings.push(message) },
    tools: { register: definition => { tool = definition; } },
  });

  const messages = [];
  const agent = { session: { header: { cwd } }, steer: message => messages.push(message) };
  const stop = (turn, subject = agent, signal = new AbortController().signal) =>
    handlers.get('agent/turn-stopping')?.({ agent: subject, turn, signal });
  return { agent, messages, stop, warnings, path, write, configure: args => tool.execute(args, { agent }) };
}

test('工作区总开关和两项 Skill 的全部开关组合', t => {
  for (const enabled of [true, false]) {
    for (const learn of [true, false]) {
      for (const docs of [true, false]) {
        const { messages, stop } = fixture(t, {
          enabled,
          skills: { 'agent-learn': learn, 'agent-docs': docs },
        });
        stop(1);
        assert.equal(messages.length, enabled && (learn || docs) ? 1 : 0);
        if (messages.length === 0) continue;
        const [message] = messages;
        assert.deepEqual(message.source, { kind: 'skill-reminder', form: 'instructions' });
        assert.equal(message.content.length, 1);
        assert.equal(message.content[0].type, 'text');
        const { text } = message.content[0];
        assert.equal(text.includes('agent-learn'), learn);
        assert.equal(text.includes('agent-docs'), docs);
        assert.match(text, /复用上下文/);
        assert.match(text, /没有实质变化/);
        assert.doesNotMatch(text, /SKILL\.md|references[/\\]/);
      }
    }
  }
});

test('只查询与轮末检查均不建文件，显式配置支持增量修改', async t => {
  const { messages, stop, path, configure } = fixture(t, null);
  stop(1);
  assert.deepEqual(await configure({}), { path, config: null });
  assert.equal(existsSync(path), false);
  assert.equal(messages.length, 0);
  const result = await configure({ learn: true });
  assert.deepEqual(result.config.skills, { 'agent-learn': true, 'agent-docs': false });
  stop(2);
  assert.doesNotMatch(messages[0].content[0].text, /agent-docs/);
  assert.equal((await configure({ learn: true })).changed, false);
  assert.deepEqual((await configure({ docs: true })).config.skills, all.skills);
  await assert.rejects(async () => configure({ enabled: 'false' }), /布尔值/);
});

test('过滤取消和子 Agent，同轮去重，下一轮与独立会话正常提醒', t => {
  const { agent, messages, stop } = fixture(t);
  stop(1, agent, AbortSignal.abort());
  for (const header of [{ origin: 'subagent' }, { delegationDepth: 1 }]) {
    stop(1, { ...agent, session: { header } });
  }
  assert.equal(messages.length, 0);

  stop(1);
  stop(1, { ...agent });
  assert.equal(messages.length, 1);

  stop(2);
  stop(1);
  assert.equal(messages.length, 2);

  stop(1, { ...agent, session: { header: { ...agent.session.header, parentSessionId: 'fork-source' } } });
  assert.equal(messages.length, 3);
});

test('投递失败只告警一次，后续轮次继续正常工作', t => {
  const { agent, messages, stop, warnings } = fixture(t);
  stop(1, { ...agent, steer: () => { throw new Error('投递不可用'); } });
  stop(1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /投递不可用/);
  assert.equal(messages.length, 0);
  stop(2);
  assert.equal(messages.length, 1);
});

test('下一轮直接读取工作区修改，同一轮仍只收到一条提醒', t => {
  const first = fixture(t);
  first.stop(1);
  first.write({ skills: { 'agent-docs': true } });
  first.stop(1);
  assert.equal(first.messages.length, 1);
  first.stop(2);
  assert.equal(first.messages.length, 2);
  assert.doesNotMatch(first.messages[1].content[0].text, /agent-learn/);
});
