import type { LensId, PairOrder } from "./lens-explorer-model.ts";

/*
 * Still, paraxial teaching schematics, not a surface-by-surface optical design.
 * Geometry: Edmund Optics, Understanding Optical Lens Geometries.
 * Axicon / finite Bessel region: Edmund Optics, An In-Depth Look at Axicons.
 * Chief-ray definition: Thorlabs, Bi-Telecentric Lenses for Machine Vision.
 * The triplet is one APO example; apochromatic correction does not imply a
 * particular number of elements. The surrounding explorer supplies that copy.
 */

type Point = readonly [number, number];
const axisY = 140;
const colors = ["#83ddff", "#a7edc5", "#e9a9db"];
const n = (value: number) => Number(value.toFixed(3));

// Prefixes normally come from application code. Encoding also makes arbitrary
// prefixes safe in both XML attributes and fragment references without aliases.
function namespace(prefix: string, variant: string): string {
    return `lens-${Array.from(prefix).map(char => /[a-zA-Z0-9-]/.test(char) ? char : `_${char.codePointAt(0)!.toString(16)}_`).join("")}-${variant}`;
}

function path(points: readonly Point[], attributes = ""): string {
    return `<path class="optics-ray" d="${points.map(([x, y], i) => `${i ? "L" : "M"}${n(x)} ${n(y)}`).join(" ")}" ${attributes}/>`;
}

function glass(d: string, prefix: string, tint = "glass", attributes = ""): string {
    return `<path class="optics-glass" d="${d}" fill="url(#${prefix}-${tint})" ${attributes}/>`;
}

function element(kind: "concave" | "convex" | "plano-concave" | "bi-convex" | "meniscus", x: number, prefix: string, scale = 1): string {
    const shapes = {
        concave: "M-34 40 Q0 140 -34 240 H34 Q0 140 34 40 Z",
        convex: "M22 40 V240 C-58 206 -58 74 22 40 Z",
        "plano-concave": "M-28 40 V240 H32 Q-26 140 32 40 Z",
        "bi-convex": "M0 36 C54 80 54 200 0 244 C-54 200 -54 80 0 36 Z",
        meniscus: "M14 40 C-64 74 -64 206 14 240 H30 C-12 204 -12 76 30 40 Z"
    };
    const edges = {
        concave: "M-29 48 Q3 140 -29 232 M29 48 Q-3 140 29 232",
        convex: "M16 48 C-48 83 -48 197 16 232 M17 53 V227",
        "plano-concave": "M-23 48 V232 M26 48 Q-28 140 26 232",
        "bi-convex": "M-2 45 C-44 88 -44 192 -2 235",
        meniscus: "M11 49 C-53 83 -53 197 11 231"
    };
    return `<g data-lens-shape="${kind}" transform="translate(${x} ${axisY * (1 - scale)}) scale(${scale})">
        ${glass(shapes[kind], prefix, kind === "bi-convex" || kind === "meniscus" ? "violet" : "glass")}
        <path class="optics-edge" d="${edges[kind]}"/>
    </g>`;
}

function focus(x: number, prefix: string): string {
    return `<g data-real-focus="${x}"><circle cx="${x}" cy="140" r="16" fill="url(#${prefix}-focus)" stroke="none" opacity=".5"/>
        <circle cx="${x}" cy="140" r="2.4" fill="#ecf3ff" stroke="none"/></g>`;
}

function shell(prefix: string, variant: string, body: string): string {
    return `<svg viewBox="0 0 640 280" class="optics-svg" aria-hidden="true" focusable="false" data-diagram="${variant}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="${prefix}-glass" x1="0%" y1="0%" x2="100%" y2="15%">
                <stop offset="0" stop-color="#c1f3ff" stop-opacity=".65"/><stop offset=".2" stop-color="#61ceff" stop-opacity=".17"/>
                <stop offset=".58" stop-color="#a2a8ff" stop-opacity=".08"/><stop offset=".85" stop-color="#c9b8ff" stop-opacity=".4"/><stop offset="1" stop-color="#f8e4ff" stop-opacity=".75"/>
            </linearGradient>
            <linearGradient id="${prefix}-violet" x1="0%" y1="0%" x2="100%" y2="25%">
                <stop offset="0" stop-color="#ddd1ff" stop-opacity=".6"/><stop offset=".3" stop-color="#a6a4ff" stop-opacity=".14"/>
                <stop offset=".7" stop-color="#acbaff" stop-opacity=".1"/><stop offset="1" stop-color="#daf4ff" stop-opacity=".65"/>
            </linearGradient>
            <linearGradient id="${prefix}-mint" x1="0%" y1="0%" x2="100%" y2="20%">
                <stop offset="0" stop-color="#bcf5e1" stop-opacity=".55"/><stop offset=".4" stop-color="#8ddbbf" stop-opacity=".1"/><stop offset="1" stop-color="#daecff" stop-opacity=".5"/>
            </linearGradient>
            <linearGradient id="${prefix}-beam" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="610" y2="0">
                <stop offset="0" stop-color="#65d9ff" stop-opacity=".25"/><stop offset=".44" stop-color="#8ce7ff"/>
                <stop offset=".7" stop-color="#b4acff"/><stop offset="1" stop-color="#e4bcff" stop-opacity=".75"/>
            </linearGradient>
            <radialGradient id="${prefix}-focus"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".2" stop-color="#d4d9ff" stop-opacity=".6"/><stop offset="1" stop-color="#a88cff" stop-opacity="0"/></radialGradient>
            <linearGradient id="${prefix}-core" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0" stop-color="#a8d6ff" stop-opacity="0"/><stop offset=".5" stop-color="#d2efff" stop-opacity=".8"/><stop offset="1" stop-color="#a8d6ff" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <path class="optics-axis" d="M18 140 H622"/>
        <g fill="none" stroke="url(#${prefix}-beam)" stroke-linecap="round" stroke-linejoin="round">${body}</g>
    </svg>`;
}

function singlet(id: "concave" | "convex" | "plano-concave" | "bi-convex" | "meniscus", prefix: string): string {
    const diverging = id === "concave" || id === "plano-concave";
    const cx = 300;
    const ys = [84, 112, 140, 168, 196];
    const rays = ys.map(y => {
        const slope = diverging ? (y - axisY) / 240 : (axisY - y) / 220;
        return path([[30, y], [cx, y], [610, y + 310 * slope]]);
    }).join("");
    const guides = diverging
        ? `<g data-virtual-focus="60" stroke-dasharray="3 6" opacity=".22">${[84, 196].map(y => path([[60, 140], [cx, y]])).join("")}</g>`
        : focus(520, prefix);
    return rays + element(id, cx, prefix) + guides;
}

function doublet(prefix: string, x = 300, scale = 1): string {
    return `<g data-lens-assembly="doublet" transform="translate(${x - 300 * scale} ${140 * (1 - scale)}) scale(${scale})">
        ${glass("M285 42 C248 82 248 198 285 238 H300 C330 198 330 82 300 42 Z", prefix, "glass", 'data-element="1"')}
        ${glass("M300 42 C330 82 330 198 300 238 H318 C332 198 332 82 318 42 Z", prefix, "violet", 'data-element="2"')}
        <path class="optics-edge" d="M282 50 C253 89 253 191 282 230"/>
    </g>`;
}

function chromatic(id: "achromatic" | "apochromat", prefix: string): string {
    const apo = id === "apochromat";
    const selectedColors = apo ? colors : [colors[0], colors[2]];
    const rays = selectedColors.map((color, i) => {
        const height = 48 + i * 14;
        return `<g data-wavelength="${i + 1}" stroke="${color}">${[-height, height].map(h => {
            if (!apo) return path([[30, 140 + h], [300, 140 + h], [610, 140 - h * 90 / 220]]);
            // An example + / − / + triplet: f1=280, f2=−220, f3=170.
            // Its intermediate bundle is collimated; the last element focuses it.
            const middle = h * 220 / 280;
            return path([[30, 140 + h], [250, 140 + h], [310, 140 + middle], [370, 140 + middle], [610, 140 - middle * 70 / 170]]);
        }).join("")}</g>`;
    }).join("");
    const lenses = apo
        ? `<g data-lens-assembly="example-triplet">${element("bi-convex", 250, prefix, .84)}${element("concave", 310, prefix, .78)}${element("bi-convex", 370, prefix, .84)}</g>`
        : doublet(prefix);
    return rays + lenses + focus(apo ? 540 : 520, prefix);
}

function axicon(prefix: string, bessel: boolean): string {
    const face = 170;
    const apex = 206;
    const coneSlope = (apex - face) / 90;
    const raySlope = .42;
    // Parallel rays strike one conical face at different radii. They leave at
    // the same angle, crossing the axis at different longitudinal positions.
    const heights = [24, 46, 70];
    const rays = heights.flatMap(height => [-1, 1].map(sign => {
        const y = 140 + sign * height;
        const exitX = apex - height * coneSlope;
        const endX = bessel ? 462 : 520;
        return path([[30, y], [exitX, y], [endX, y - sign * (endX - exitX) * raySlope]], 'style="opacity:.55"');
    })).join("");
    const start = apex + heights[0] * (1 / raySlope - coneSlope);
    const end = apex + heights[2] * (1 / raySlope - coneSlope);
    const core = `<g data-axial-region="finite">
        <rect x="${n(start)}" y="132" width="${n(end - start)}" height="16" rx="8" fill="url(#${prefix}-core)" stroke="none" opacity="${bessel ? ".85" : ".35"}"/>
        <path d="M${n(start)} 140 H${n(end)}" stroke="#e2f1ff" stroke-width="${bessel ? "2.8" : "1.5"}" opacity=".8"/>
        <path d="M${n(start)} 234 V240 H${n(end)} V234" stroke="#aabce266" stroke-width="1"/>
    </g>`;
    const cone = `<g data-lens-shape="axicon">${glass(`M${face} 50 L${apex} 140 L${face} 230 Z`, prefix)}<path class="optics-edge" d="M174 66 L202 140 L174 214"/></g>`;
    const inset = bessel
        ? `<g data-intensity-cross-section="bessel" transform="translate(548 140)">
            <circle r="56" fill="#111821" stroke="#adc7f330" stroke-width="1"/>
            <circle r="43" stroke="#b8aaff" stroke-width="3" opacity=".16"/>
            <circle r="32" stroke="#b8bfff" stroke-width="3.5" opacity=".23"/>
            <circle r="21" stroke="#b3d8ff" stroke-width="4" opacity=".34"/>
            <circle r="8" fill="url(#${prefix}-focus)" stroke="none"/>
            <circle r="3.8" fill="#dff5ff" stroke="none"/>
        </g>`
        : `<g data-intensity-cross-section="ring" transform="translate(560 140)">
            <ellipse rx="31" ry="58" fill="#141622" stroke="#bcaef22b" stroke-width="1"/>
            <ellipse rx="20" ry="39" stroke="#c2b6ff" stroke-width="8" opacity=".1"/>
            <ellipse rx="20" ry="39" stroke="#c6c7ff" stroke-width="2.8" opacity=".7"/>
        </g>`;
    return rays + core + cone + inset;
}

function telecentric(prefix: string): string {
    // Symmetric 4f relay: x_object=100, L1=210, stop=320, L2=430,
    // x_image=540, f1=f2=110. Only the chief rays are parallel outside it.
    const rays = [-48, 0, 48].map((height, i) => {
        const chief = path([[68, 140 + height], [210, 140 + height], [430, 140 - height], [572, 140 - height]], 'data-chief-ray="true"');
        const marginal = [-14, 14].map(aperture => path([
            [100, 140 + height], [210, 140 + height + aperture],
            [430, 140 - height + aperture], [540, 140 - height]
        ], 'data-marginal-ray="true" style="opacity:.3"')).join("");
        return `<g stroke="${colors[i]}">${marginal}${chief}<circle cx="100" cy="${140 + height}" r="2.7" fill="${colors[i]}" stroke="none"/><circle cx="540" cy="${140 - height}" r="2.7" fill="${colors[i]}" stroke="none"/></g>`;
    }).join("");
    const stop = `<g data-aperture-stop="320" stroke="#c9cee6" stroke-width="4"><path d="M320 45 V122 M320 158 V235"/><path d="M312 122 H328 M312 158 H328" stroke-width="2"/></g>`;
    return rays + `<g data-optical-group="1">${doublet(prefix, 210, .8)}</g><g data-optical-group="2">${doublet(prefix, 430, .8)}</g>` + stop;
}

/** Caller supplies a different prefix for each simultaneously displayed SVG. */
export function renderLensDiagram(id: LensId, prefix: string): string {
    const key = namespace(prefix, id);
    let body: string;
    switch (id) {
        case "concave": case "convex": case "plano-concave": case "bi-convex": case "meniscus": body = singlet(id, key); break;
        case "achromatic": case "apochromat": body = chromatic(id, key); break;
        case "axicon": case "bessel": body = axicon(key, id === "bessel"); break;
        case "telecentric": body = telecentric(key); break;
        default: { const impossible: never = id; throw new Error(`Unknown lens diagram: ${impossible}`); }
    }
    return shell(key, id, body);
}

/** The order changes both silhouettes AND the refraction at the second lens. */
export function renderLensPair(order: PairOrder, prefix: string): string {
    const key = namespace(prefix, order);
    const expanding = order === "concave-convex";
    const ys = expanding ? [102, 121, 140, 159, 178] : [70, 105, 140, 175, 210];
    const rays = ys.map(y => {
        const h = y - axisY;
        const second = expanding ? h * 1.95 : h * .45;
        // Diverging lens then positive lens: widen, then converge toward a
        // distant real focus. Positive then negative: converge, then collimate.
        const end = expanding ? second * .48 : second;
        return path([[30, y], [224, y], [416, 140 + second], [610, 140 + end]]);
    }).join("");
    const first = element(expanding ? "concave" : "bi-convex", 224, key, expanding ? .96 : 1);
    const second = element(expanding ? "bi-convex" : "concave", 416, key, expanding ? 1 : .86);
    return shell(key, order, rays + first + second);
}
