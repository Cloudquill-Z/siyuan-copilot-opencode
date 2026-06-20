import assert from 'node:assert/strict';
import { resolveWorkspaceTarget } from './utils.js';

const workspaces = [
    { path: '/old/SiYuan', closed: false },
    { path: '/active/Siyuan', closed: false },
];

assert.equal(
    resolveWorkspaceTarget(workspaces, '/active/Siyuan'),
    '/active/Siyuan/data/plugins'
);
assert.equal(resolveWorkspaceTarget([{ path: '/only', closed: false }], ''), '/only/data/plugins');
assert.equal(resolveWorkspaceTarget(workspaces, '/missing'), null);

console.log('workspace target selection verification passed');
