import assert from 'node:assert/strict';
import { parseOpenCodeModelId, expandOpenCodeCliPath } from '../src/utils/opencode.ts';
import { createAcceptLanguageHeader } from '../src/utils/i18n.ts';

assert.deepEqual(parseOpenCodeModelId('opencode/big-pickle'), {
    providerID: 'opencode',
    modelID: 'big-pickle',
});

assert.deepEqual(parseOpenCodeModelId('github/copilot/claude-sonnet-4'), {
    providerID: 'github/copilot',
    modelID: 'claude-sonnet-4',
});

assert.equal(parseOpenCodeModelId('big-pickle'), undefined);
assert.equal(parseOpenCodeModelId('opencode/'), undefined);

const expandedPath = expandOpenCodeCliPath({
    HOME: '/Users/example',
    PATH: '/usr/bin',
}, false).PATH;

assert.equal(
    expandedPath,
    '/Users/example/.opencode/bin:/usr/local/bin:/opt/homebrew/bin:/Users/example/.local/bin:/Users/example/bin:/usr/bin'
);

assert.equal(createAcceptLanguageHeader('zh_CN'), 'zh-CN,zh;q=0.9,en;q=0.8');
assert.equal(createAcceptLanguageHeader('en_US'), 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7');
assert.equal(createAcceptLanguageHeader('fr_FR'), 'fr-FR,fr;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6');

console.log('Utility tests passed');
