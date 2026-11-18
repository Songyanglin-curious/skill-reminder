import { readWorkspaceConfig, updateWorkspaceConfig } from './workspace-config.mjs';

try {
  const [operation, patch] = process.argv.slice(2);
  const cwd = process.cwd();
  if (operation === 'show' && patch === undefined) {
    const result = readWorkspaceConfig(cwd);
    console.log(JSON.stringify({ ...result, config: result.config ?? null }));
  } else if (operation === 'set' && patch !== undefined) {
    console.log(JSON.stringify(updateWorkspaceConfig(cwd, JSON.parse(patch))));
  } else {
    throw new Error('用法：node config-cli.mjs show | set <JSON>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
