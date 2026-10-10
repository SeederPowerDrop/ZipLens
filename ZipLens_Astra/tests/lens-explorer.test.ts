import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Load the real controller and its dependencies without a WebView. Transpilation
// erases DOM types and rewrites only the extensionless browser module imports.
function moduleUrl(name: string, dependencies: Record<string, string> = {}) {
    const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
    let compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
    }).outputText;
    for (const [specifier, url] of Object.entries(dependencies)) {
        compiled = compiled.replaceAll(`from "${specifier}"`, `from "${url}"`);
    }
    return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

const stateUrl = moduleUrl("lens-explorer-model");
const copyUrl = moduleUrl("lens-explorer-copy");
const controllerUrl = moduleUrl("lens-explorer", {
    "./lens-explorer-model": stateUrl,
    "./lens-explorer-copy": copyUrl,
    "./lens-diagrams": moduleUrl("lens-diagrams")
});
const { HomeLensExplorer } = await import(controllerUrl);
const { LensExplorerState } = await import(stateUrl);
const { getExplorerCopy, getLensCopy } = await import(copyUrl);

class BubbleEvent {
    readonly type: string;
    readonly detail: number;
    readonly key: string;
    propagationStopped = false;
    defaultPrevented = false;

    constructor(type: string, init: { detail?: number; key?: string } = {}) {
        this.type = type;
        this.detail = init.detail ?? 0;
        this.key = init.key ?? "";
    }
    stopPropagation() { this.propagationStopped = true; }
    preventDefault() { this.defaultPrevented = true; }
}

class ElementFixture {
    parent: ElementFixture | null = null;
    dataset: Record<string, string> = {};
    textContent = "";
    title = "";
    hidden = false;
    focusCalls = 0;
    readonly attributes = new Map<string, string>();
    readonly htmlWrites: string[] = [];
    readonly selectors = new Map<string, ElementFixture>();
    readonly listeners = new Map<string, ((event: BubbleEvent) => void)[]>();
    readonly classes = new Set<string>();
    readonly classList = { add: (...names: string[]) => names.forEach(name => this.classes.add(name)) };
    private html = "";

    get innerHTML() { return this.html; }
    set innerHTML(value: string) { this.html = value; this.htmlWrites.push(value); }
    querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    focus() { this.focusCalls++; }
    addEventListener(type: string, handler: (event: BubbleEvent) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
    }
    dispatch(type: string, init: { detail?: number; key?: string } = {}) {
        const event = new BubbleEvent(type, init);
        let current: ElementFixture | null = this;
        while (current) {
            for (const handler of current.listeners.get(type) ?? []) handler(event);
            if (event.propagationStopped) break;
            current = current.parent;
        }
        return event;
    }
}

function fixture(randomValue = 0.25) {
    const dropZone = new ElementFixture();
    const container = new ElementFixture();
    container.parent = dropZone;
    let pickerCalls = 0;
    let outerDoubleClicks = 0;
    let interactive = true;
    let randomCalls = 0;
    dropZone.addEventListener("click", () => { pickerCalls++; });
    dropZone.addEventListener("dblclick", () => { outerDoubleClicks++; });

    // These are the nodes created by the controller's initial HTML template.
    // Keep the fixture small: no HTML parser or native button default actions.
    const nodes = Object.fromEntries([
        "trigger", "reset", "info", "name", "description", "hint", "note"
    ].map(name => {
        const node = new ElementFixture();
        node.parent = container;
        container.selectors.set(`.lens-explorer-${name}`, node);
        return [name, node];
    }));
    const illustration = new ElementFixture();
    illustration.parent = nodes.trigger;
    const explorer = new HomeLensExplorer(container, "explorer-test", "ko", () => interactive, () => {
        randomCalls++;
        return randomValue;
    });
    const expected = new LensExplorerState(() => randomValue);
    return {
        container, nodes, illustration, explorer, expected,
        get pickerCalls() { return pickerCalls; },
        get outerDoubleClicks() { return outerDoubleClicks; },
        get randomCalls() { return randomCalls; },
        setInteractive(value: boolean) { interactive = value; }
    };
}

function pointerDoubleClick(target: ElementFixture) {
    target.dispatch("click", { detail: 1 });
    target.dispatch("click", { detail: 2 });
    return target.dispatch("dblclick", { detail: 2 });
}

test("both pointer clicks stay inside the illustration and each double-click advances exactly once", () => {
    const ui = fixture();
    assert.equal(ui.container.dataset.view, "pair");
    const openingOrder = ui.container.dataset.lens;

    for (const detail of [1, 2]) {
        const event = ui.illustration.dispatch("click", { detail });
        assert.equal(event.propagationStopped, true);
        assert.equal(ui.container.dataset.lens, openingOrder);
        assert.equal(ui.pickerCalls, 0, `click detail=${detail} must not open the file picker`);
    }
    const doubleClick = ui.illustration.dispatch("dblclick", { detail: 2 });
    assert.equal(doubleClick.defaultPrevented, true);
    assert.equal(doubleClick.propagationStopped, true);
    assert.equal(ui.container.dataset.lens, ui.expected.next());
    assert.equal(ui.container.dataset.view, "exhibit");

    pointerDoubleClick(ui.illustration);
    assert.equal(ui.container.dataset.lens, ui.expected.next(), "a pointer sequence consumes one exhibit");
    assert.equal(ui.pickerCalls, 0);
    assert.equal(ui.outerDoubleClicks, 0);
});

test("keyboard button activation advances once per synthesized click without opening files", () => {
    const ui = fixture();
    for (const key of ["Enter", " "]) {
        ui.nodes.trigger.dispatch("keydown", { key });
        // Native buttons synthesize click(detail=0) for keyboard activation.
        ui.nodes.trigger.dispatch("click", { detail: 0 });
        assert.equal(ui.container.dataset.lens, ui.expected.next());
        assert.equal(ui.pickerCalls, 0);
    }
});

test("a busy interaction guard blocks activation and reset without consuming the next exhibit", () => {
    const ui = fixture();
    const openingOrder = ui.container.dataset.lens;
    ui.setInteractive(false);
    pointerDoubleClick(ui.illustration);
    ui.nodes.trigger.dispatch("click", { detail: 0 });
    assert.equal(ui.container.dataset.lens, openingOrder);
    assert.equal(ui.randomCalls, 1, "blocked activation must not shuffle a tour");

    ui.setInteractive(true);
    ui.nodes.trigger.dispatch("click", { detail: 0 });
    const current = ui.expected.next();
    assert.equal(ui.container.dataset.lens, current);
    const illustration = ui.nodes.trigger.innerHTML;
    ui.setInteractive(false);
    pointerDoubleClick(ui.illustration);
    ui.nodes.trigger.dispatch("click", { detail: 0 });
    ui.nodes.reset.dispatch("click", { detail: 1 });
    ui.nodes.trigger.dispatch("keydown", { key: "Escape" });
    assert.equal(ui.container.dataset.lens, current);
    assert.equal(ui.container.dataset.view, "exhibit");
    assert.equal(ui.nodes.trigger.innerHTML, illustration);
    assert.equal(ui.nodes.trigger.focusCalls, 0);

    ui.setInteractive(true);
    pointerDoubleClick(ui.illustration);
    assert.equal(ui.container.dataset.lens, ui.expected.next());
    assert.equal(ui.pickerCalls, 0);
});

test("language changes update labels while preserving the pair order, current exhibit and tour", () => {
    const ui = fixture(0.75);
    const openingOrder = ui.container.dataset.lens;
    const pairDiagram = ui.nodes.trigger.innerHTML;
    ui.explorer.setLanguage("en");
    assert.equal(ui.container.dataset.lens, openingOrder);
    assert.equal(ui.nodes.trigger.innerHTML, pairDiagram);
    assert.equal(ui.randomCalls, 1);
    assert.equal(ui.nodes.hint.textContent, getExplorerCopy("en").activateHint);

    ui.nodes.trigger.dispatch("click", { detail: 0 });
    const current = ui.expected.next();
    const diagram = ui.nodes.trigger.innerHTML;
    const randomCalls = ui.randomCalls;
    ui.explorer.setLanguage("ja");
    assert.equal(ui.container.dataset.lens, current);
    assert.equal(ui.nodes.trigger.innerHTML, diagram);
    assert.equal(ui.randomCalls, randomCalls);
    assert.equal(ui.nodes.name.textContent, getLensCopy("ja", current).name);
    assert.equal(ui.nodes.description.textContent, getLensCopy("ja", current).description);
    assert.equal(ui.nodes.hint.textContent, getExplorerCopy("ja").nextHint);
    assert.equal(ui.nodes.trigger.attributes.get("aria-label"), getLensCopy("ja", current).name);
    ui.nodes.trigger.dispatch("click", { detail: 0 });
    assert.equal(ui.container.dataset.lens, ui.expected.next());
});

test("reset and Escape restore the original pair in either order and return focus to its trigger", () => {
    for (const randomValue of [0.25, 0.75]) {
        const ui = fixture(randomValue);
        const openingOrder = ui.container.dataset.lens;
        const pairDiagram = ui.nodes.trigger.innerHTML;
        for (const method of ["button", "escape"]) {
            ui.nodes.trigger.dispatch("click", { detail: 0 });
            assert.equal(ui.container.dataset.lens, ui.expected.next());
            assert.equal(ui.nodes.info.hidden, false);
            assert.equal(ui.nodes.reset.hidden, false);
            const randomCalls = ui.randomCalls;
            if (method === "button") {
                ui.nodes.reset.dispatch("click", { detail: 1 });
            } else {
                const event = ui.nodes.trigger.dispatch("keydown", { key: "Escape" });
                assert.equal(event.defaultPrevented, true);
                assert.equal(event.propagationStopped, true);
            }
            assert.equal(ui.container.dataset.view, "pair");
            assert.equal(ui.container.dataset.lens, openingOrder);
            assert.equal(ui.nodes.trigger.innerHTML, pairDiagram);
            assert.equal(ui.nodes.info.hidden, true);
            assert.equal(ui.nodes.reset.hidden, true);
            assert.equal(ui.randomCalls, randomCalls, "reset must not rerandomize the pair");
        }
        assert.equal(ui.nodes.trigger.focusCalls, 2);
        assert.equal(ui.pickerCalls, 0);
    }
});

test("translated copy remains text, including HTML-like lens names, explanations and hints", () => {
    const ui = fixture();
    const current = ui.expected.next();
    const explorerCopy = getExplorerCopy("en");
    const lensCopy = getLensCopy("en", current);
    const originalExplorer = { ...explorerCopy };
    const originalLens = { ...lensCopy };
    const payload = '<img data-copy-injection src=x onerror="alert(1)">';
    try {
        for (const key of Object.keys(explorerCopy)) explorerCopy[key] = `${key}: ${payload}`;
        lensCopy.name = `Name: ${payload}`;
        lensCopy.description = `Description: ${payload}`;
        ui.explorer.setLanguage("en");
        assert.equal(ui.nodes.hint.textContent, explorerCopy.activateHint);
        assert.equal(ui.nodes.trigger.attributes.get("aria-label"), explorerCopy.pairTitle);
        ui.nodes.trigger.dispatch("click", { detail: 0 });
        assert.equal(ui.nodes.name.textContent, lensCopy.name);
        assert.equal(ui.nodes.description.textContent, lensCopy.description);
        assert.equal(ui.nodes.note.textContent, explorerCopy.diagramNote);
        assert.equal(ui.nodes.hint.textContent, explorerCopy.nextHint);
        assert.equal(ui.nodes.trigger.attributes.get("aria-label"), lensCopy.name);
        assert.equal(ui.nodes.reset.attributes.get("aria-label"), explorerCopy.backToPair);
        assert.equal(ui.nodes.trigger.title, explorerCopy.nextHint);
        assert.equal(ui.nodes.reset.title, explorerCopy.backToPair);
        for (const node of [ui.container, ...Object.values(ui.nodes)]) {
            assert.ok(node.htmlWrites.every(html => !html.includes("data-copy-injection")), "copy must never enter an HTML sink");
        }
        for (const name of ["name", "description", "note", "hint"]) {
            assert.equal(ui.nodes[name].htmlWrites.length, 0);
        }
    } finally {
        Object.assign(explorerCopy, originalExplorer);
        Object.assign(lensCopy, originalLens);
    }
});
