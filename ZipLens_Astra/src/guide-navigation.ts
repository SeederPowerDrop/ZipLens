import type { LanguageCode } from "./i18n";

const guideFallbackNotices = {
    ko: "브라우저를 열지 못했습니다. 대신 앱에 포함된 사용 가이드를 보여드립니다.",
    en: "The browser could not be opened. The guide included with the app is shown instead.",
    ja: "ブラウザーを開けませんでした。代わりにアプリに含まれるガイドを表示します。",
    zh: "无法打开浏览器，现显示应用内附带的使用指南。",
    vi: "Không mở được trình duyệt. Hướng dẫn có sẵn trong ứng dụng được hiển thị thay thế.",
    es: "No se pudo abrir el navegador. Se muestra la guía incluida en la aplicación.",
    fr: "Le navigateur n’a pas pu être ouvert. Le guide inclus dans l’application s’affiche à la place.",
    de: "Der Browser konnte nicht geöffnet werden. Stattdessen wird die in der App enthaltene Anleitung angezeigt.",
    ru: "Не удалось открыть браузер. Вместо этого показано руководство, включённое в приложение.",
    ar: "تعذر فتح المتصفح. يُعرض بدلاً من ذلك الدليل المضمّن في التطبيق.",
} satisfies Record<LanguageCode, string>;

/** Only known app locale codes may become a GitHub path segment. */
function guideLanguage(language: string): LanguageCode {
    return Object.prototype.hasOwnProperty.call(guideFallbackNotices, language)
        ? language as LanguageCode : "en";
}

export function getUserGuideUrl(language: string): string {
    return `https://github.com/SeederPowerDrop/ZipLens/blob/main/ZipLens_Astra/docs/guides/${guideLanguage(language)}.md`;
}

interface GuideNavigation {
    getLanguage: () => string;
    openUrl: (url: string) => Promise<void>;
    showOfflineGuide: (language: LanguageCode, notice: string) => void;
    setBusy: (busy: boolean) => void;
}

/** Both help links share one in-flight request, and failures keep the bundled guide usable. */
export function createGuideOpener(navigation: GuideNavigation): () => Promise<"browser" | "offline" | "busy"> {
    let busy = false;
    return async () => {
        if (busy) return "busy";
        const language = guideLanguage(navigation.getLanguage());
        busy = true;
        try {
            navigation.setBusy(true);
            try {
                await navigation.openUrl(getUserGuideUrl(language));
                return "browser";
            } catch {
                // A browser launch failure is visible in the fallback, never reported as success.
                navigation.showOfflineGuide(language, guideFallbackNotices[language]);
                return "offline";
            }
        } finally {
            busy = false;
            navigation.setBusy(false);
        }
    };
}
