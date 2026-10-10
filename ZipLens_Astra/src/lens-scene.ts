export type ProcessingOperation = "extract" | "compress" | "preview";
type SceneMode = ProcessingOperation | "home";

/**
 * The operation, never translated status text, selects the optical geometry.
 * Operation scenes send light left → right: a concave lens spreads parallel rays;
 * a convex lens brings them to a common focus and a single outgoing beam.
 * Home brings both lenses together in one still optical path.
 * The moving highlights indicate activity, not bytes or a simulated percentage.
 */
export class LensScene {
    private mode: SceneMode = "extract";

    constructor(private container: HTMLElement, id: string) {
        // All markup is application-owned. Archive names never enter this SVG.
        const rays = (compress: boolean) => [80, 110, 140, 170, 200].map((y, i) => {
            const end = compress ? `520 140 L610 140` : `610 ${20 + i * 60}`;
            const path = `M30 ${y} L300 ${y} L${end}`;
            return `<path class="optics-ray" d="${path}" />
                <path class="optics-photon" d="${path}" pathLength="100" style="--ray-delay:${-i * 0.31}s" />`;
        }).join("");
        const homeRays = [96, 118, 140, 162, 184].map((y, i) =>
            `<path class="optics-ray" d="M30 ${y} H224 L416 ${60 + i * 40} L610 ${y}"/>`
        ).join("");
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
                    <linearGradient id="${id}-paired-glass" x1="0%" y1="0%" x2="100%" y2="25%">
                        <stop offset="0" stop-color="#d8d0ff" stop-opacity=".6"/>
                        <stop offset=".2" stop-color="#a6a4ff" stop-opacity=".18"/>
                        <stop offset=".62" stop-color="#acbaff" stop-opacity=".09"/>
                        <stop offset=".87" stop-color="#c7e9ff" stop-opacity=".35"/>
                        <stop offset="1" stop-color="#eefaff" stop-opacity=".65"/>
                    </linearGradient>
                </defs>
                <path class="optics-axis" d="M18 140 H622"/>
                <g class="optics-home" stroke="url(#${id}-beam)">
                    <path class="optics-envelope" d="M30 96 H224 L416 60 L610 96 V184 L416 220 L224 184 H30 Z" fill="url(#${id}-beam)"/>
                    ${homeRays}
                    <g class="optics-home-concave">
                        <path class="optics-glass" d="M193 42 Q226 140 193 238 H255 Q222 140 255 42 Z" fill="url(#${id}-glass)"/>
                        <path class="optics-edge" d="M198 50 Q229 140 198 230 M250 50 Q219 140 250 230"/>
                        <path class="optics-rim" d="M193 42 H255 M193 238 H255"/>
                    </g>
                    <g class="optics-home-convex">
                        <path class="optics-glass" d="M416 34 C470 76 470 204 416 246 C362 204 362 76 416 34 Z" fill="url(#${id}-paired-glass)"/>
                        <path class="optics-edge" d="M414 43 C371 87 371 193 414 237 M422 45 C465 90 465 190 422 235"/>
                    </g>
                </g>
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
        if (mode === "preview") this.setRunning(false);
    }

    setHome(caption = "") {
        this.mode = "home";
        this.container.dataset.mode = "home";
        this.container.querySelector(".optics-caption")!.textContent = caption;
        this.setRunning(false);
    }

    setRunning(running: boolean) {
        this.container.dataset.running = String(running && (this.mode === "extract" || this.mode === "compress"));
    }

    setProgress(percent: number | null) {
        // Unknown progress stays unknown; do not turn the photon loop into an ETA.
        const known = percent !== null && Number.isFinite(percent);
        this.container.dataset.progress = known ? "known" : "unknown";
        const energy = known ? 0.35 + Math.min(100, Math.max(0, percent)) / 100 * 0.65 : 0.65;
        this.container.style.setProperty("--optics-energy", String(energy));
    }
}
