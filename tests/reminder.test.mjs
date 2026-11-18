import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { apply, Config } from '../src/index.mjs';

const example = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));

function fixture(config = {}) {
  const handlers = new Map();
  const warnings = [];
  apply({
    on: (event, listener) => handlers.set(event, listener),
    logger: { warn: message => warnings.push(message) },
  }, Config(config));

  const messages = [];
  const agent = { session: { header: {} }, steer: message => messages.push(message) };
  const stop = (turn, subject = agent, signal = new AbortController().signal) =>
    handlers.get('agent/turn-stopping')?.({ agent: subject, turn, signal });
  return { agent, messages, stop, warnings };
}

test('JSON 示例、全局开关和两项 Skill 的全部开关组合', () => {
  assert.deepEqual(Config({}), example);
  for (const enabled of [true, false]) {
    for (const learn of [true, false]) {
      for (const docs of [true, false]) {
        const { messages, stop } = fixture({
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

test('部分配置保留另一个 Skill 的默认值并拒绝非布尔 JSON 配置', () => {
  const { messages, stop } = fixture({ skills: { 'agent-docs': false } });
  stop(1);
  assert.match(messages[0].content[0].text, /agent-learn/);
  assert.doesNotMatch(messages[0].content[0].text, /agent-docs/);
  assert.throws(() => Config({ enabled: 'false' }));
  assert.throws(() => Config({ skills: { 'agent-learn': 0 } }));
});

test('过滤取消和子 Agent，同轮去重，下一轮与独立会话正常提醒', () => {
  const { agent, messages, stop } = fixture();
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

  stop(1, { ...agent, session: { header: { parentSessionId: 'fork-source' } } });
  assert.equal(messages.length, 3);
});

test('投递失败只告警一次，后续轮次继续正常工作', () => {
  const { agent, messages, stop, warnings } = fixture();
  stop(1, { ...agent, steer: () => { throw new Error('投递不可用'); } });
  stop(1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /投递不可用/);
  assert.equal(messages.length, 0);
  stop(2);
  assert.equal(messages.length, 1);
});

test('配置重新加载时，同一会话的当前轮次仍只收到一条提醒', () => {
  const first = fixture();
  first.stop(1);
  const updated = fixture({ skills: { 'agent-learn': false } });
  updated.stop(1, first.agent);
  assert.equal(first.messages.length, 1);
  updated.stop(2, first.agent);
  assert.equal(first.messages.length, 2);
  assert.doesNotMatch(first.messages[1].content[0].text, /agent-learn/);
});
