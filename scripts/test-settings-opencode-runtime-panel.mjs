import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsPanelSource = readFileSync(
    new URL('../src/SettingsPanel.svelte', import.meta.url),
    'utf8'
);
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
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
    /stopServe\(\);[\s\S]*return this\.initOpenCodeServer/,
    'Restart should stop the managed server before starting it again'
);

assert.match(
    agentsSource,
    /patch 小版本号同步加一/,
    'Local agent rules should require patch version bumps for changes'
);
