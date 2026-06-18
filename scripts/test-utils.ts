import assert from 'node:assert/strict';
import { parseOpenCodeModelId, expandOpenCodeCliPath } from '../src/utils/opencode.ts';
import { createAcceptLanguageHeader } from '../src/utils/i18n.ts';
import {
    formatComposerStatusSummary,
    getComposerModeMeta,
    getThinkingDisplayLabel,
} from '../src/utils/composerControls.ts';
import { ComponentMountRegistry } from '../src/utils/componentMountRegistry.ts';

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

assert.deepEqual(getComposerModeMeta('plan'), {
    label: '问答',
    tone: 'answer',
});
assert.deepEqual(getComposerModeMeta('build'), {
    label: '修订',
    tone: 'revision',
});
assert.equal(getThinkingDisplayLabel('off', true), '关闭');
assert.equal(getThinkingDisplayLabel('high', true), 'High');
assert.equal(getThinkingDisplayLabel('auto', false), '关闭');
assert.equal(
    formatComposerStatusSummary({
        mode: 'plan',
        modelName: '',
        thinking: 'off',
        supportsThinking: true,
    }),
    '问答 · 选择模型 · 关闭'
);
assert.equal(
    formatComposerStatusSummary({
        mode: 'build',
        modelName: 'Claude Sonnet 4',
        thinking: 'medium',
        supportsThinking: true,
    }),
    '修订 · Claude Sonnet 4 · Middle'
);

const destroyedMounts: string[] = [];
const mountRegistry = new ComponentMountRegistry<{ $destroy(): void }>();
const firstMount = {} as HTMLElement;
const secondMount = {} as HTMLElement;
mountRegistry.set(firstMount, { $destroy: () => destroyedMounts.push('first') });
mountRegistry.set(secondMount, { $destroy: () => destroyedMounts.push('second') });
mountRegistry.destroy(firstMount);
assert.deepEqual(destroyedMounts, ['first']);
assert.equal(mountRegistry.has(firstMount), false);
assert.equal(mountRegistry.has(secondMount), true);
mountRegistry.destroyAll();
assert.deepEqual(destroyedMounts, ['first', 'second']);
assert.equal(mountRegistry.size, 0);

console.log('Utility tests passed');
