import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/codex-stop.mjs', import.meta.url));
const stop = { hook_event_name: 'Stop', stop_hook_active: false };

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'skill-reminder-stop-'));
  const configFile = join(directory, 'skill-reminder.json');
  t.after(() => {
    rmSync(configFile, { force: true });
    rmdirSync(directory);
  });

  return {
    setConfig: config => writeFileSync(configFile, config),
    run(input) {
      const { status, stdout, stderr } = spawnSync(process.execPath, [entry], {
        input: typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf8',
        env: { ...process.env, CODEX_HOME: directory },
      });
      assert.equal(status, 0, stderr);
      return { output: JSON.parse(stdout), stderr };
    },
  };
}

test('Codex 首次停止只返回一条合并提醒，由 Stop 续接时放行', t => {
  const { run } = fixture(t);
  const { output } = run(stop);
  assert.equal(output.decision, 'block');
  assert.match(output.reason, /agent-learn/);
  assert.match(output.reason, /agent-docs/);
  assert.deepEqual(run({ ...stop, stop_hook_active: true }).output, {});
  assert.deepEqual(run({ ...stop, hook_event_name: 'SubagentStop' }).output, {});
  assert.deepEqual(run({ ...stop, hook_event_name: 'Interrupt' }).output, {});
});

test('Codex 从 JSON 独立启用 Skill，关闭提醒时直接放行', t => {
  const { run, setConfig } = fixture(t);
  setConfig(JSON.stringify({ skills: { 'agent-learn': false } }));
  const { reason } = run(stop).output;
  assert.doesNotMatch(reason, /agent-learn/);
  assert.match(reason, /agent-docs/);
  setConfig(JSON.stringify({ enabled: false }));
  assert.deepEqual(run(stop).output, {});
  setConfig(JSON.stringify({ skills: { 'agent-learn': false, 'agent-docs': false } }));
  assert.deepEqual(run(stop).output, {});
});

test('Codex 将无效输入或配置报告到 stderr 并放行', t => {
  const { run, setConfig } = fixture(t);
  const malformed = run('{');
  assert.deepEqual(malformed.output, {});
  assert.match(malformed.stderr, /跳过本轮检查/);
  setConfig('{"enabled":"false"}');
  const invalid = run(stop);
  assert.deepEqual(invalid.output, {});
  assert.match(invalid.stderr, /布尔值/);
});
