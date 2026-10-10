/**
 * 하나의 사용자 작업은 파일 선택부터 암호 입력·코덱 실행·결과창 닫기까지 포함한다.
 * 코덱이 쉬는 대화상자 구간에도 busy를 유지해 다른 입력이 현재 선택을 덮어쓰지 못하게 한다.
 * 큐가 아니라 중복 진입 방지 장치다. Finder/CLI 요청의 보관과 재개는 main.ts가 담당한다.
 */
export class ArchiveActionGate {
    private active = false;
    private readonly changed: (busy: boolean) => void;

    constructor(changed: (busy: boolean) => void = () => {}) { this.changed = changed; }

    get busy(): boolean { return this.active; }

    /** busy이면 실행 없이 undefined를 반환한다. action의 성공·실패 모두 finally에서 잠금을 해제한다. */
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
