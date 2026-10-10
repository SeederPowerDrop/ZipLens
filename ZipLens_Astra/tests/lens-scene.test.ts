import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the production controller without a WebView; geometry/rendering is
// checked separately in the native app. TypeScript erases DOM-only types here.
const source = readFileSync(new URL("../src/lens-scene.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const { LensScene } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function fixture(id = "test-optics") {
    const caption = { textContent: "" };
    const properties = new Map<string, string>();
    const container = {
        dataset: {} as Record<string, string>, innerHTML: "",
        classList: { add() {} },
        style: { setProperty: (key: string, value: string) => properties.set(key, value) },
        querySelector: () => caption
    };
    return { container, caption, properties, scene: new LensScene(container, id) };
}

test("Korean and Japanese captions cannot change the selected operation or execute HTML", () => {
    const { scene, container, caption } = fixture();
    scene.setMode("extract", "오목렌즈 · 빛의 확산");
    scene.setRunning(true);
    assert.equal(container.dataset.mode, "extract");
    assert.equal(container.dataset.running, "true");
    scene.setMode("compress", "凸レンズ · 光が集まる <img src=x>");
    assert.equal(container.dataset.mode, "compress");
    assert.equal(caption.textContent, "凸レンズ · 光が集まる <img src=x>");
    assert.ok(!container.innerHTML.includes("<img"));
});

test("preview never starts a compression animation and stopping a job removes motion", () => {
    const { scene, container } = fixture();
    scene.setMode("preview", "Loading preview");
    scene.setRunning(true);
    assert.equal(container.dataset.running, "false");
    scene.setMode("compress", "압축 중");
    scene.setRunning(true);
    scene.setRunning(false);
    assert.equal(container.dataset.running, "false");
});

test("returning home stops an active job and both lenses share a still beam", () => {
    const { scene, container, caption } = fixture();
    scene.setMode("extract", "압축 해제 중");
    scene.setRunning(true);
    scene.setHome("파일에 맞춰 압축 또는 해제");
    assert.equal(container.dataset.mode, "home");
    assert.equal(container.dataset.running, "false");
    assert.equal(caption.textContent, "파일에 맞춰 압축 또는 해제");
    scene.setRunning(true);
    assert.equal(container.dataset.running, "false");

    const home = container.innerHTML.split('<g class="optics-home"')[1].split('<g class="optics-extract"')[0];
    assert.match(home, /class="optics-home-concave"/);
    assert.match(home, /class="optics-home-convex"/);
    assert.equal((home.match(/class="optics-ray"/g) ?? []).length, 5);
    assert.match(home, /M30 140 H224 L416 140 L610 140/);
    assert.doesNotMatch(home, /optics-photon|optics-focus|<animate/);

    scene.setMode("compress", "압축 중");
    scene.setRunning(true);
    assert.equal(container.dataset.running, "true");
});

test("switching directly from an active operation to preview clears motion", () => {
    const { scene, container } = fixture();
    scene.setMode("compress", "압축 중");
    scene.setRunning(true);
    scene.setMode("preview", "미리 보기");
    assert.equal(container.dataset.running, "false");
});

test("unknown or invalid progress is not presented as a measured percentage", () => {
    const { scene, container, properties } = fixture();
    for (const value of [null, NaN, Infinity]) {
        scene.setProgress(value);
        assert.equal(container.dataset.progress, "unknown");
        assert.ok(Number.isFinite(Number(properties.get("--optics-energy"))));
    }
    scene.setProgress(37);
    assert.equal(container.dataset.progress, "known");
    for (const value of [-50, 150]) {
        scene.setProgress(value);
        const energy = Number(properties.get("--optics-energy"));
        assert.ok(energy >= 0.35 && energy <= 1);
    }
});

test("scenes have independent gradients and keep horizontal rays visible", () => {
    const a = fixture("home-optics").container.innerHTML;
    const b = fixture("progress-optics").container.innerHTML;
    const ids = (html: string) => [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    assert.ok(ids(a).every(id => !ids(b).includes(id)));
    // SVG objectBoundingBox gradients disappear on a zero-height center ray.
    assert.match(a, /id="home-optics-beam" gradientUnits="userSpaceOnUse"/);
    assert.match(a, /M30 140 L300 140 L610 140/);
    assert.match(a, /M30 140 L300 140 L520 140 L610 140/);
});
