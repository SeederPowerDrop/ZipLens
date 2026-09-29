/** One user action includes choosing files and answering dialogs, as well as codec work. */
export class ArchiveActionGate {
    private active = false;
    private readonly changed: (busy: boolean) => void;

    constructor(changed: (busy: boolean) => void = () => {}) { this.changed = changed; }

    get busy(): boolean { return this.active; }

    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
        if (this.active) return undefined;
        this.active = true;
        this.changed(true);
        try {
            return await action();
        } finally {
            this.active = false;
            this.changed(false);
        }
    }
}
