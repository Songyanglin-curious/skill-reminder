import { readFileSync } from 'node:fs';
import { reminderForWorkspace } from './reminders.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  let result = {};
  // Codex 在由 Stop 续接的同一轮传入 stop_hook_active，直接放行。
  if (input?.hook_event_name === 'Stop' && input.stop_hook_active === false) {
    const reason = reminderForWorkspace(input.cwd);
    if (reason) result = { decision: 'block', reason };
  }
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(`skill-reminder 跳过本轮检查：${error.message}\n`);
  process.stdout.write('{}');
}
