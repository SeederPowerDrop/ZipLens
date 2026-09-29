export type ProcessingOperation = "extract" | "compress" | "preview";

/**
 * The operation, never translated status text, selects the optical geometry.
 * Both scenes send light left → right: a concave lens spreads parallel rays;
 * a convex lens brings them to a common focus and a single outgoing beam.
 * The moving highlights indicate activity, not bytes or a simulated percentage.
 */
export class LensScene {
    private mode: ProcessingOperation = "extract";

    constructor(private container: HTMLElement, id: string) {
        // All markup is application-owned. Archive names never enter this SVG.
        const rays = (compress: boolean) => [80, 110, 140, 170, 200].map((y, i) => {
            const end = compress ? `520 140 L610 140` : `610 ${20 + i * 60}`;
            const path = `M30 ${y} L300 ${y} L${end}`;
            return `<path class="optics-ray" d="${path}" />
                <path class="optics-photon" d="${path}" pathLength="100" style="--ray-delay:${-i * 0.31}s" />`;
        }).join("");
        this.container.classList.add("optics-scene");
        this.container.dataset.mode = "extract";
        this.container.dataset.running = "false";
        this.container.innerHTML = `
            <svg viewBox="0 0 640 280" class="optics-svg" aria-hidden="true" focusable="false">
                <defs>
                    <linearGradient id="${id}-glass" x1="0%" y1="0%" x2="100%" y2="15%">
                        <stop offset="0" stop-color="#c1f3ff" stop-opacity=".65"/>
                        <stop offset=".2" stop-color="#61ceff" stop-opacity=".17"/>
                        <stop offset=".58" stop-color="#a2a8ff" stop-opacity=".08"/>
                        <stop offset=".85" stop-color="#c9b8ff" stop-opacity=".4"/>
                        <stop offset="1" stop-color="#f8e4ff" stop-opacity=".75"/>
                    </linearGradient>
                    <!-- User coordinates also render the horizontal center ray (zero-height bounding box). -->
                    <linearGradient id="${id}-beam" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="610" y2="0">
                        <stop offset="0" stop-color="#65d9ff" stop-opacity=".25"/>
                        <stop offset=".44" stop-color="#8ce7ff"/>
                        <stop offset=".7" stop-color="#b4acff"/>
                        <stop offset="1" stop-color="#e4bcff" stop-opacity=".75"/>
                    </linearGradient>
                    <radialGradient id="${id}-focus">
                        <stop offset="0" stop-color="#fff" stop-opacity=".95"/>
                        <stop offset=".18" stop-color="#d2c3ff" stop-opacity=".7"/>
                        <stop offset="1" stop-color="#a88cff" stop-opacity="0"/>
                    </radialGradient>
                </defs>
                <path class="optics-axis" d="M18 140 H622"/>
                <g class="optics-extract" stroke="url(#${id}-beam)">
                    <path class="optics-envelope" d="M30 80 H300 L610 20 V260 L300 200 H30 Z" fill="url(#${id}-beam)"/>
                    ${rays(false)}
                    <path class="optics-glass" d="M264 38 Q294 140 264 242 L336 242 Q306 140 336 38 Z" fill="url(#${id}-glass)"/>
                    <path class="optics-edge" d="M269 46 Q297 140 269 234 M331 46 Q303 140 331 234"/>
                </g>
                <g class="optics-compress" stroke="url(#${id}-beam)">
                    <path class="optics-envelope" d="M30 80 H300 L520 140 L300 200 H30 Z" fill="url(#${id}-beam)"/>
                    ${rays(true)}
                    <path class="optics-glass" d="M300 38 C350 80 350 200 300 242 C250 200 250 80 300 38 Z" fill="url(#${id}-glass)"/>
                    <path class="optics-edge" d="M298 47 C258 92 258 188 298 233"/>
                    <circle class="optics-focus" cx="520" cy="140" r="26" fill="url(#${id}-focus)" stroke="none"/>
                    <path class="optics-output" d="M520 140 H610"/>
                </g>
            </svg>
            <div class="optics-caption"></div>`;
    }

    setMode(mode: ProcessingOperation, caption: string) {
        this.mode = mode;
        this.container.dataset.mode = mode;
        this.container.querySelector(".optics-caption")!.textContent = caption;
    }

    setRunning(running: boolean) {
        this.container.dataset.running = String(running && this.mode !== "preview");
    }

    setProgress(percent: number | null) {
        // Unknown progress stays unknown; do not turn the photon loop into an ETA.
        const known = percent !== null && Number.isFinite(percent);
        this.container.dataset.progress = known ? "known" : "unknown";
        const energy = known ? 0.35 + Math.min(100, Math.max(0, percent)) / 100 * 0.65 : 0.65;
        this.container.style.setProperty("--optics-energy", String(energy));
    }
}
