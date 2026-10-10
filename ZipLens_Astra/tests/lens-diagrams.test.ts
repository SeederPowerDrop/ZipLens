import test from "node:test";
import assert from "node:assert/strict";
import { renderLensDiagram, renderLensPair } from "../src/lens-diagrams.ts";
import { lensIds } from "../src/lens-explorer-model.ts";

type Point = [number, number];
function rays(svg: string, attribute = "") {
    return [...svg.matchAll(/<path class="optics-ray" d="([^"]+)"([^>]*)\/>/g)]
        .filter(match => match[2].includes(attribute))
        .map(match => [...match[1].matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)]
            .map(point => [Number(point[1]), Number(point[2])] as Point));
}

function yAt(a: Point, b: Point, x: number) {
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
}

function near(actual: number, expected: number) {
    assert.ok(Math.abs(actual - expected) < .005, `${actual} should be close to ${expected}`);
}

test("every exhibit is a distinct, complete, still SVG with local gradient references", () => {
    const diagrams = lensIds.map(id => renderLensDiagram(id, "gallery"));
    assert.equal(new Set(diagrams).size, lensIds.length);
    for (const svg of [...diagrams, renderLensPair("concave-convex", "home"), renderLensPair("convex-concave", "home")]) {
        assert.match(svg, /^<svg viewBox="0 0 640 280" class="optics-svg" aria-hidden="true" focusable="false"/);
        assert.match(svg, /<\/svg>$/);
        assert.doesNotMatch(svg, /<animate|optics-photon|animation:|setInterval|NaN|Infinity/);
        const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
        assert.equal(new Set(ids).size, ids.length);
        for (const reference of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(reference[1]), reference[1]);
        assert.match(svg, /-beam" gradientUnits="userSpaceOnUse"/);
    }
});

test("independent prefixes cannot collide or inject SVG markup", () => {
    const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
    const first = ids(renderLensDiagram("concave", "home"));
    const second = ids(renderLensDiagram("concave", "gallery"));
    assert.ok(first.every(id => !second.includes(id)));
    const unsafe = renderLensDiagram("convex", '\"><script>alert(1)</script>');
    assert.doesNotMatch(unsafe, /<script|alert\(1\)/);
    assert.equal((unsafe.match(/<svg\b/g) ?? []).length, 1);
    // Literal escape-like input stays distinct from an encoded unsafe character.
    assert.notDeepEqual(ids(renderLensDiagram("convex", "<")), ids(renderLensDiagram("convex", "_3c_")));
});

test("positive singlets cross a real focus and continue diverging after it", () => {
    for (const id of ["convex", "bi-convex", "meniscus"] as const) {
        const paths = rays(renderLensDiagram(id, "positive"));
        assert.equal(paths.length, 5);
        for (const [start, lens, end] of paths) {
            assert.equal(start[1], lens[1]);
            near(yAt(lens, end, 520), 140);
            if (lens[1] !== 140) assert.ok((lens[1] - 140) * (end[1] - 140) < 0);
        }
    }
});

test("negative singlets spread rays from the indicated virtual focus", () => {
    for (const id of ["concave", "plano-concave"] as const) {
        const paths = rays(renderLensDiagram(id, "negative")).slice(0, 5);
        for (const [start, lens, end] of paths) {
            assert.equal(start[1], lens[1]);
            near(yAt(lens, end, 60), 140);
            assert.ok(Math.abs(end[1] - 140) >= Math.abs(lens[1] - 140));
        }
    }
});

test("swapping the pair changes ray bending as well as the lens order", () => {
    for (const order of ["concave-convex", "convex-concave"] as const) {
        const paths = rays(renderLensPair(order, "pair"));
        assert.equal(paths.length, 5);
        for (const [start, first, second, end] of paths) {
            assert.equal(start[1], first[1]);
            if (first[1] === 140) continue;
            if (order === "concave-convex") {
                assert.ok(Math.abs(second[1] - 140) > Math.abs(first[1] - 140));
                assert.ok(Math.abs(end[1] - 140) < Math.abs(second[1] - 140));
            } else {
                assert.ok(Math.abs(second[1] - 140) < Math.abs(first[1] - 140));
                assert.equal(second[1], end[1]);
            }
        }
    }
});

test("achromat and APO bring two or three sample wavelengths to their common focus", () => {
    for (const [id, count, focus] of [["achromatic", 2, 520], ["apochromat", 3, 540]] as const) {
        const svg = renderLensDiagram(id, "color");
        assert.equal((svg.match(/data-wavelength=/g) ?? []).length, count);
        for (const points of rays(svg)) near(yAt(points.at(-2)!, points.at(-1)!, focus), 140);
    }
    assert.equal((renderLensDiagram("achromatic", "color").match(/data-element=/g) ?? []).length, 2);
    assert.match(renderLensDiagram("apochromat", "color"), /data-lens-assembly="example-triplet"/);
});

test("axicon rays cross at a range of positions; Bessel has finite core and side rings", () => {
    const svg = renderLensDiagram("axicon", "cone");
    const crossings = rays(svg).map(points => {
        const [exit, end] = points.slice(-2);
        return exit[0] + (140 - exit[1]) * (end[0] - exit[0]) / (end[1] - exit[1]);
    });
    assert.ok(Math.max(...crossings) - Math.min(...crossings) > 80);
    assert.match(svg, /data-intensity-cross-section="ring"/);
    const beam = renderLensDiagram("bessel", "beam");
    assert.match(beam, /data-axial-region="finite"/);
    assert.match(beam, /data-intensity-cross-section="bessel"/);
    assert.ok((beam.match(/<circle r=/g) ?? []).length >= 5);
});

test("telecentric chief rays are parallel outside the relay and pass the stop center", () => {
    const svg = renderLensDiagram("telecentric", "relay");
    assert.equal((svg.match(/data-optical-group=/g) ?? []).length, 2);
    assert.match(svg, /data-aperture-stop="320"/);
    const chief = rays(svg, 'data-chief-ray="true"');
    assert.equal(chief.length, 3);
    for (const [start, first, second, end] of chief) {
        assert.equal(start[1], first[1]);
        assert.equal(second[1], end[1]);
        near(yAt(first, second, 320), 140);
        near(start[1] + end[1], 280);
    }
    for (const [start, first, second, end] of rays(svg, 'data-marginal-ray="true"')) {
        assert.notEqual(start[1], first[1]);
        assert.notEqual(second[1], end[1]);
        assert.ok(Math.abs(yAt(first, second, 320) - 140) < 18);
    }
});
