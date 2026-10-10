import { LensExplorerState } from "./lens-explorer-model";
import { renderLensDiagram, renderLensPair } from "./lens-diagrams";
import { getExplorerCopy, getLensCopy } from "./lens-explorer-copy";
import type { LanguageCode } from "./i18n";

/** The home illustration is its own input surface, separate from opening files. */
export class HomeLensExplorer {
    private readonly state: LensExplorerState;
    private readonly trigger: HTMLButtonElement;
    private readonly resetButton: HTMLButtonElement;
    private readonly info: HTMLElement;
    private readonly name: HTMLElement;
    private readonly description: HTMLElement;
    private readonly hint: HTMLElement;
    private readonly note: HTMLElement;

    constructor(
        private readonly container: HTMLElement,
        private readonly id: string,
        private language: LanguageCode,
        private readonly canInteract: () => boolean = () => true,
        random: () => number = Math.random
    ) {
        this.state = new LensExplorerState(random);
        container.classList.add("optics-scene", "lens-explorer");
        container.innerHTML = `
            <button type="button" class="lens-explorer-trigger" aria-describedby="${id}-hint"></button>
            <button type="button" class="lens-explorer-reset" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-3"/></svg>
            </button>
            <div class="lens-explorer-info" aria-live="polite" aria-atomic="true" hidden>
                <div class="lens-explorer-name"></div>
                <p class="lens-explorer-description"></p>
            </div>
            <div class="lens-explorer-footer">
                <span class="lens-explorer-note"></span>
                <span class="lens-explorer-hint" id="${id}-hint"></span>
            </div>`;
        this.trigger = container.querySelector(".lens-explorer-trigger")!;
        this.resetButton = container.querySelector(".lens-explorer-reset")!;
        this.info = container.querySelector(".lens-explorer-info")!;
        this.name = container.querySelector(".lens-explorer-name")!;
        this.description = container.querySelector(".lens-explorer-description")!;
        this.hint = container.querySelector(".lens-explorer-hint")!;
        this.note = container.querySelector(".lens-explorer-note")!;

        // Both clicks preceding dblclick must stop here, with no delayed file dialog.
        container.addEventListener("click", event => event.stopPropagation());
        container.addEventListener("dblclick", event => event.stopPropagation());
        this.trigger.addEventListener("click", event => {
            // Native button activation also supports keyboard and assistive technology.
            if (event.detail === 0) this.next();
        });
        this.trigger.addEventListener("dblclick", event => {
            event.preventDefault();
            this.next();
        });
        container.addEventListener("keydown", event => {
            if (event.key === "Escape" && this.state.current && this.canInteract()) {
                event.preventDefault();
                event.stopPropagation();
                this.reset();
            }
        });
        this.resetButton.addEventListener("click", () => {
            if (this.canInteract()) this.reset();
        });
        this.render();
    }

    setLanguage(language: LanguageCode) {
        this.language = language;
        this.updateCopy();
    }

    private next() {
        if (!this.canInteract()) return;
        this.state.next();
        this.render();
    }

    private reset() {
        this.state.reset();
        this.render();
        this.trigger.focus({ preventScroll: true });
    }

    private render() {
        const current = this.state.current;
        this.container.dataset.view = current ? "exhibit" : "pair";
        this.container.dataset.lens = current ?? this.state.pairOrder;
        this.trigger.innerHTML = current
            ? renderLensDiagram(current, this.id)
            : renderLensPair(this.state.pairOrder, this.id);
        this.info.hidden = !current;
        this.resetButton.hidden = !current;
        this.updateCopy();
    }

    private updateCopy() {
        const copy = getExplorerCopy(this.language);
        const current = this.state.current;
        const lens = current ? getLensCopy(this.language, current) : null;
        this.name.textContent = lens?.name ?? "";
        this.description.textContent = lens?.description ?? "";
        this.note.textContent = copy.diagramNote;
        this.hint.textContent = current ? copy.nextHint : copy.activateHint;
        this.trigger.setAttribute("aria-label", lens?.name ?? copy.pairTitle);
        this.trigger.title = current ? copy.nextHint : copy.activateHint;
        this.resetButton.setAttribute("aria-label", copy.backToPair);
        this.resetButton.title = copy.backToPair;
    }
}
