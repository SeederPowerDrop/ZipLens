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

/**
 * validator는 실제 파일 읽기/해제를 수행할 수 있어 제출 중에도 취소 버튼을 유지한다.
 * resolve(password)는 검증 성공, resolve(null)은 사용자 취소, reject는 처리할 수 없는 오류다.
 * 실행 중 취소는 요청만 보낸다. validator와 취소 요청이 정리된 뒤 창을 닫아 다음 작업과 겹치지 않는다.
 */
export function showPasswordDialog(controls: PasswordControls, validator: (password: string) => Promise<boolean>, callbacks: PasswordCallbacks, isRetry = false): Promise<string | null> {
    const { modal, input, submit, cancel, error } = controls;
    return new Promise((resolve, reject) => {
        let submitting = false;
        let cancelRequested = false;
        let cancellation: Promise<void> | null = null;
        // 늦게 끝난 취소 요청이 이미 닫힌 창의 컨트롤을 다시 활성화하지 않도록 구분한다.
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
                // 취소가 검증 완료와 경합하면 사용자의 취소 의사를 먼저 반영한다.
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
