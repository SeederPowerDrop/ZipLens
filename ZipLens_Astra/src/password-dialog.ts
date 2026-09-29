interface PasswordControls {
    modal: HTMLElement;
    input: HTMLInputElement;
    submit: HTMLButtonElement;
    cancel: HTMLButtonElement;
    error: HTMLElement | null;
}

interface PasswordCallbacks {
    cancelWork: () => Promise<unknown>;
    running: (running: boolean) => void;
    cancelFailed: (error: unknown) => void;
}

/** Keep the prompt cancellable while its validator reads or extracts an encrypted archive. */
export function showPasswordDialog(controls: PasswordControls, validator: (password: string) => Promise<boolean>, callbacks: PasswordCallbacks, isRetry = false): Promise<string | null> {
    const { modal, input, submit, cancel, error } = controls;
    return new Promise((resolve, reject) => {
        let submitting = false;
        let cancelRequested = false;
        let cancellation: Promise<void> | null = null;
        let settled = false;
        if (error) error.style.display = isRetry ? "block" : "none";
        callbacks.running(false);
        modal.style.display = "flex";
        input.value = "";
        input.focus();

        const cleanup = () => {
            settled = true;
            modal.style.display = "none";
            submit.onclick = cancel.onclick = null;
            modal.removeEventListener("keydown", onKeyDown);
            input.value = "";
            input.disabled = submit.disabled = cancel.disabled = false;
        };
        const onCancel = () => {
            if (settled || cancelRequested) return;
            if (!submitting) { cleanup(); resolve(null); return; }
            cancelRequested = true;
            cancel.disabled = true;
            cancellation = callbacks.cancelWork().then(() => {}, failure => {
                cancelRequested = false;
                if (!settled) { cancel.disabled = false; callbacks.cancelFailed(failure); }
            });
        };
        const onSubmit = async () => {
            if (settled || submitting) return;
            submitting = true;
            callbacks.running(true);
            input.disabled = submit.disabled = true;
            cancel.disabled = false;
            const password = input.value;
            cancel.focus();
            try {
                const accepted = await validator(password);
                if (cancellation) await cancellation;
                if (cancelRequested) { cleanup(); resolve(null); }
                else if (accepted) { cleanup(); resolve(password); }
                else if (error) error.style.display = "block";
            } catch (failure) {
                if (cancellation) await cancellation;
                cleanup();
                if (cancelRequested && String(failure) === "CANCELLED") resolve(null);
                else reject(failure);
            } finally {
                callbacks.running(false);
                submitting = false;
                input.disabled = submit.disabled = cancel.disabled = false;
                if (!settled) input.focus();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") { event.preventDefault(); onCancel(); }
            else if (event.key === "Enter" && event.target === input) { event.preventDefault(); void onSubmit(); }
        };
        submit.onclick = onSubmit;
        cancel.onclick = onCancel;
        modal.addEventListener("keydown", onKeyDown);
    });
}
