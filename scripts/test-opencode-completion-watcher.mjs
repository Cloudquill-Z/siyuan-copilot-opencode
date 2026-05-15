import assert from 'node:assert/strict';

const { createRealtimeCompletionWatcher } = await import('../src/providers/realtime-completion-watcher.ts');

function createManualClock() {
    let currentTime = 0;
    const sleepers = [];

    return {
        now: () => currentTime,
        sleep: (ms) => new Promise((resolve) => {
            sleepers.push({ at: currentTime + ms, resolve });
        }),
        async advance(ms) {
            currentTime += ms;
            const ready = sleepers.filter((item) => item.at <= currentTime);
            for (const item of ready) {
                const index = sleepers.indexOf(item);
                if (index >= 0) sleepers.splice(index, 1);
                item.resolve();
            }
            await Promise.resolve();
            await Promise.resolve();
        },
    };
}

async function expectRejectsWith(promise, messagePart) {
    try {
        await promise;
    } catch (error) {
        assert.match(error.message, messagePart);
        return;
    }
    assert.fail('Expected promise to reject');
}

async function completesWhenStatusTurnsIdle() {
    const clock = createManualClock();
    const statuses = ['running', 'running', 'idle'];
    const watcher = createRealtimeCompletionWatcher({
        idleTimeoutMs: 100,
        pollIntervalMs: 10,
        now: clock.now,
        sleep: clock.sleep,
        getSessionStatus: async () => statuses.shift() || 'idle',
    });

    const wait = watcher.wait();
    await clock.advance(10);
    await clock.advance(10);
    await clock.advance(10);
    await wait;
    return true;
}

async function staysAliveWhenToolStatusIsRunning() {
    const clock = createManualClock();
    let polls = 0;
    const watcher = createRealtimeCompletionWatcher({
        idleTimeoutMs: 50,
        pollIntervalMs: 10,
        now: clock.now,
        sleep: clock.sleep,
        getSessionStatus: async () => {
            polls += 1;
            return polls < 8 ? 'running' : 'idle';
        },
    });

    watcher.markActivity('tool-running');
    const wait = watcher.wait();
    for (let i = 0; i < 8; i += 1) {
        await clock.advance(10);
    }
    await wait;
    assert.equal(polls >= 8, true);
    return true;
}

async function failsWhenNoActivityAndNoRunningStatus() {
    const clock = createManualClock();
    const watcher = createRealtimeCompletionWatcher({
        idleTimeoutMs: 30,
        pollIntervalMs: 10,
        now: clock.now,
        sleep: clock.sleep,
        getSessionStatus: async () => 'unknown',
    });

    const wait = watcher.wait();
    await clock.advance(10);
    await clock.advance(10);
    await clock.advance(10);
    await clock.advance(10);
    await expectRejectsWith(wait, /appears stalled/i);
    return true;
}

async function abortWinsImmediately() {
    const clock = createManualClock();
    const controller = new AbortController();
    const watcher = createRealtimeCompletionWatcher({
        signal: controller.signal,
        idleTimeoutMs: 1000,
        pollIntervalMs: 10,
        now: clock.now,
        sleep: clock.sleep,
        getSessionStatus: async () => 'running',
    });

    const wait = watcher.wait();
    controller.abort();
    await expectRejectsWith(wait, /aborted/i);
    return true;
}

assert.equal(await completesWhenStatusTurnsIdle(), true);
assert.equal(await staysAliveWhenToolStatusIsRunning(), true);
assert.equal(await failsWhenNoActivityAndNoRunningStatus(), true);
assert.equal(await abortWinsImmediately(), true);

console.log('OpenCode completion watcher verification passed');
