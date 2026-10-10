export const lensIds = [
    "concave", "convex", "plano-concave", "bi-convex", "meniscus",
    "achromatic", "apochromat", "axicon", "bessel", "telecentric"
] as const;

export type LensId = typeof lensIds[number];
export type PairOrder = "concave-convex" | "convex-concave";

/** One opening order per app session; shuffled tours visit every exhibit. */
export class LensExplorerState {
    readonly pairOrder: PairOrder;
    current: LensId | null = null;
    private remaining: LensId[] = [];
    private lastShown: LensId | null = null;
    private readonly random: () => number;

    constructor(random: () => number = Math.random) {
        this.random = random;
        this.pairOrder = random() < 0.5 ? "concave-convex" : "convex-concave";
    }

    next(): LensId {
        if (!this.remaining.length) {
            this.remaining = [...lensIds];
            for (let i = this.remaining.length - 1; i > 0; i--) {
                const j = Math.floor(this.random() * (i + 1));
                [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
            }
            // A new shuffled tour must not immediately repeat its predecessor.
            if (this.remaining[0] === this.lastShown) {
                [this.remaining[0], this.remaining[1]] = [this.remaining[1], this.remaining[0]];
            }
        }
        this.current = this.remaining.shift()!;
        this.lastShown = this.current;
        return this.current;
    }

    reset() { this.current = null; }
}
