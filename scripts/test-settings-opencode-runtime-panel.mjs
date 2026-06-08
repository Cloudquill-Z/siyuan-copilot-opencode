import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsPanelSource = readFileSync(
    new URL('../src/SettingsPanel.svelte', import.meta.url),
    'utf8'
);
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const runnerSource = readFileSync(new URL('../src/opencode-runner.ts', import.meta.url), 'utf8');
const agentsSource = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');

assert.match(
    settingsPanelSource,
    /import pluginManifest from '\.\.\/plugin\.json';/,
    'Settings panel should read the packaged plugin version'
);

assert.match(
    settingsPanelSource,
    /connectionStatusStore/,
    'Settings panel should subscribe to OpenCode connection status'
);

assert.match(
    settingsPanelSource,
    /重启 OpenCode Server/,
    'Settings panel should expose a manual OpenCode Server restart button'
);

assert.match(
    indexSource,
    /async restartOpenCodeServer\(/,
    'Plugin entry should expose a restart method for settings UI'
);

assert.match(
    indexSource,
    /restartServe\(/,
    'Restart should use the runner restart flow'
);

assert.match(
    runnerSource,
    /export async function restartServe/,
    'Runner should expose an explicit restart flow'
);

assert.match(
    runnerSource,
    /stopServe\(\);[\s\S]*stopExistingOpenCodeServeOnPort/,
    'Restart should stop the managed server and any existing opencode serve process on the target port'
);

assert.match(
    runnerSource,
    /waitForServerUnavailable[\s\S]*ensureServerRunning/,
    'Restart should wait until the old server is unavailable before starting it again'
);

assert.match(
    runnerSource,
    /stopExistingOpenCodeServeOnPort/,
    'Restart should stop an existing opencode serve process on the target port before starting it again'
);

assert.match(
    agentsSource,
    /patch 小版本号同步加一/,
    'Local agent rules should require patch version bumps for changes'
);
