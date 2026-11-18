import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/codex-stop.mjs', import.meta.url));
const cli = fileURLToPath(new URL('../src/config-cli.mjs', import.meta.url));
const stop = { hook_event_name: 'Stop', stop_hook_active: false };

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'skill-reminder-stop-'));
  const nested = join(directory, 'nested');
  mkdirSync(nested);
  const gitMarker = join(directory, '.git');
  writeFileSync(gitMarker, 'gitdir: worktree');
  const configFile = join(directory, '.skill-reminder.json');
  t.after(() => {
    rmSync(configFile, { force: true });
    rmSync(gitMarker);
    rmdirSync(nested);
    rmdirSync(directory);
  });

  return {
    setConfig: config => writeFileSync(configFile, config),
    configure(...args) {
      const { status, stdout, stderr } = spawnSync(process.execPath, [cli, ...args], { cwd: nested, encoding: 'utf8' });
      assert.equal(status, 0, stderr);
      return JSON.parse(stdout);
    },
    run(input) {
      const { status, stdout, stderr } = spawnSync(process.execPath, [entry], {
        input: typeof input === 'string' ? input : JSON.stringify({ cwd: nested, ...input }),
        encoding: 'utf8',
        cwd: nested,
      });
      assert.equal(status, 0, stderr);
      return { output: JSON.parse(stdout), stderr };
    },
  };
}

test('Codex 首次停止只返回一条合并提醒，由 Stop 续接时放行', t => {
  const { run, setConfig } = fixture(t);
  assert.deepEqual(run(stop).output, {});
  setConfig(JSON.stringify({ skills: { 'agent-learn': true, 'agent-docs': true } }));
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
  setConfig(JSON.stringify({ skills: { 'agent-docs': true } }));
  const { reason } = run(stop).output;
  assert.doesNotMatch(reason, /agent-learn/);
  assert.match(reason, /agent-docs/);
  setConfig(JSON.stringify({ enabled: false }));
  assert.deepEqual(run(stop).output, {});
  setConfig(JSON.stringify({ skills: { 'agent-learn': false, 'agent-docs': false } }));
  assert.deepEqual(run(stop).output, {});
});

test('Codex 配置入口定位 Git 根并即时影响轮末提醒', t => {
  const { run, configure } = fixture(t);
  assert.equal(configure('show').config, null);
  const learned = configure('set', '{"skills":{"agent-learn":true}}');
  assert.equal(learned.changed, true);
  assert.equal(configure('show').path, learned.path);
  const { reason } = run(stop).output;
  assert.match(reason, /agent-learn/);
  assert.doesNotMatch(reason, /agent-docs/);
  const changed = configure('set', '{"skills":{"agent-docs":true}}');
  assert.equal(changed.config.skills['agent-learn'], true);
  assert.match(run(stop).output.reason, /agent-docs/);
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
