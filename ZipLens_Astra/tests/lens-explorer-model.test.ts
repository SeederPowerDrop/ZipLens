import test from "node:test";
import assert from "node:assert/strict";
import { LensExplorerState, lensIds } from "../src/lens-explorer-model.ts";

test("the opening pair can take either order and is sampled only once", () => {
    for (const [random, expected] of [[0, "concave-convex"], [0.499, "concave-convex"], [0.5, "convex-concave"], [0.999, "convex-concave"]] as const) {
        let calls = 0;
        const state = new LensExplorerState(() => { calls++; return random; });
        assert.equal(calls, 1);
        assert.equal(state.pairOrder, expected);
        assert.equal(state.current, null);
        state.next();
        state.reset();
        assert.equal(state.pairOrder, expected);
        assert.equal(state.current, null);
    }
});

test("each random tour contains all ten exhibits and no consecutive repeats", () => {
    for (const random of [() => 0, () => 0.5, () => 0.999999, Math.random]) {
        const state = new LensExplorerState(random);
        let previous: string | null = null;
        for (let tour = 0; tour < 5; tour++) {
            const seen = new Set();
            for (let i = 0; i < lensIds.length; i++) {
                const id = state.next();
                assert.notEqual(id, previous);
                assert.equal(state.current, id);
                seen.add(id);
                previous = id;
            }
            assert.deepEqual([...seen].sort(), [...lensIds].sort());
        }
    }
});

test("returning to the pair preserves the unfinished tour", () => {
    const state = new LensExplorerState(() => 0.2);
    const first = state.next();
    state.reset();
    assert.equal(state.current, null);
    assert.notEqual(state.next(), first);
});
