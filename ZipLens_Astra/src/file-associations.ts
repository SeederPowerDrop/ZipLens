import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentLang, type LanguageCode } from "./i18n";

interface FileAssociationStatus {
    extension: string;
    is_default: boolean;
    error: string | null;
}

const messages = {
    en: {
        title: "Default archive app", close: "Close", intro: "Open archives in ZipLens 2.0 when you double-click them in Finder. Files open in preview first.",
        selection: "Choose file types", all: "Select all", none: "Clear selection", current: "ZipLens is default", other: "Not default", unknown: "Could not check", loading: "Checking current defaults…", applying: "Setting defaults…",
        apply: "Use ZipLens for selected types", scope: "Checked types will use ZipLens. Unchecking does not undo existing defaults. Extensions macOS treats as the same format may change together.",
        support: "Extraction: ZIP / 7Z / RAR / ALZ / EGG, compressed TAR, CAB / LZH / ARJ / CPIO / AR / XAR / WIM, comic archives, ISO / DMG, and split archives (.001).",
        limits: "ALZ and EGG support extraction only. Finder’s Compress command stays the same.",
        loadError: "Could not read the default apps.", applyError: "Could not change the default apps.", retry: "Try again",
        success: "ZipLens is now the default for {count} selected file types.", partial: "Set for {success} file types. {failed} could not be set; see the marked types.",
        appRequired: "To change defaults, run the built ZipLens app, for example from your Applications folder.", selected: "{count} selected", errorDetails: "Details"
    },
    ko: {
        title: "기본 압축 앱 설정", close: "닫기", intro: "Finder에서 압축 파일을 두 번 클릭하면 ZipLens 2.0의 미리보기로 열립니다.",
        selection: "파일 형식 선택", all: "전체 선택", none: "선택 해제", current: "ZipLens가 기본 앱", other: "기본 앱 아님", unknown: "확인 불가", loading: "현재 기본 앱 확인 중…", applying: "기본 앱 설정 중…",
        apply: "선택한 형식의 기본 앱으로 설정", scope: "체크한 형식을 ZipLens로 연결합니다. 체크를 해제해도 기존 연결은 해제되지 않습니다. macOS가 같은 형식으로 묶는 확장자는 함께 변경될 수 있습니다.",
        support: "압축 해제: ZIP / 7Z / RAR / ALZ / EGG, TAR 압축 계열, CAB / LZH / ARJ / CPIO / AR / XAR / WIM, 만화 압축 파일, ISO / DMG, 분할 압축(.001).",
        limits: "ALZ·EGG는 압축 해제만 지원합니다. Finder의 ‘압축’ 명령은 기존과 같습니다.",
        loadError: "기본 앱을 확인하지 못했습니다.", applyError: "기본 앱을 변경하지 못했습니다.", retry: "다시 시도",
        success: "선택한 {count}개 형식의 기본 앱을 ZipLens로 설정했습니다.", partial: "{success}개 형식을 설정했습니다. {failed}개는 설정하지 못했으니 표시된 형식을 확인하세요.",
        appRequired: "기본 앱을 변경하려면 빌드된 ZipLens 앱을 실행하세요. 응용 프로그램 폴더에 넣어두면 편리합니다.", selected: "{count}개 선택", errorDetails: "상세 내용"
    },
    ja: {
        title: "標準の圧縮アプリ", close: "閉じる", intro: "Finderで圧縮ファイルをダブルクリックすると、ZipLens 2.0のプレビューで開きます。",
        selection: "ファイル形式を選択", all: "すべて選択", none: "選択を解除", current: "ZipLensが標準", other: "標準ではありません", unknown: "確認できません", loading: "現在の設定を確認中…", applying: "標準アプリを設定中…",
        apply: "選択した形式の標準アプリに設定", scope: "選択した形式をZipLensで開きます。選択解除では既存の設定は解除されません。macOSが同じ形式とみなす拡張子も一緒に変更される場合があります。",
        support: "解凍: ZIP / 7Z / RAR / ALZ / EGG、圧縮TAR、CAB / LZH / ARJ / CPIO / AR / XAR / WIM、コミック書庫、ISO / DMG、分割書庫（.001）。",
        limits: "ALZ・EGGは解凍のみ対応しています。Finderの「圧縮」コマンドは変わりません。",
        loadError: "標準アプリを確認できませんでした。", applyError: "標準アプリを変更できませんでした。", retry: "再試行",
        success: "選択した{count}形式の標準アプリをZipLensに設定しました。", partial: "{success}形式を設定しました。{failed}形式は設定できませんでした。マークされた形式を確認してください。",
        appRequired: "設定を変更するには、ビルド済みのZipLensアプリを開いてください。アプリケーションフォルダへの配置をお勧めします。", selected: "{count}形式を選択", errorDetails: "詳細"
    },
    zh: {
        title: "默认压缩应用", close: "关闭", intro: "在 Finder 中双击压缩文件时，使用 ZipLens 2.0 打开预览。",
        selection: "选择文件类型", all: "全选", none: "取消选择", current: "ZipLens 为默认应用", other: "不是默认应用", unknown: "无法确认", loading: "正在检查默认应用…", applying: "正在设置默认应用…",
        apply: "设为所选类型的默认应用", scope: "勾选的类型将使用 ZipLens。取消勾选不会撤销已有默认设置。macOS 视为同一格式的扩展名可能一起更改。",
        support: "解压：ZIP / 7Z / RAR / ALZ / EGG、压缩 TAR、CAB / LZH / ARJ / CPIO / AR / XAR / WIM、漫画压缩文件、ISO / DMG 和分卷压缩文件（.001）。",
        limits: "ALZ 和 EGG 仅支持解压。Finder 的“压缩”命令保持不变。",
        loadError: "无法读取默认应用。", applyError: "无法更改默认应用。", retry: "重试",
        success: "已将 ZipLens 设为所选 {count} 种类型的默认应用。", partial: "已设置 {success} 种类型，{failed} 种未能设置。请查看标记的类型。",
        appRequired: "要更改默认应用，请运行构建后的 ZipLens 应用。建议将其放入“应用程序”文件夹。", selected: "已选 {count} 种", errorDetails: "详细信息"
    },
    fr: {
        title: "Application d’archives par défaut", close: "Fermer", intro: "Un double-clic sur une archive dans le Finder ouvre son aperçu dans ZipLens 2.0.",
        selection: "Choisir les types de fichiers", all: "Tout sélectionner", none: "Tout désélectionner", current: "ZipLens par défaut", other: "Autre application", unknown: "Vérification impossible", loading: "Vérification des réglages…", applying: "Modification en cours…",
        apply: "Utiliser ZipLens pour les types sélectionnés", scope: "Les types cochés utiliseront ZipLens. Décocher n’annule pas les réglages existants. Les extensions d’un même format macOS peuvent changer ensemble.",
        support: "Extraction : ZIP / 7Z / RAR / ALZ / EGG, TAR compressé, CAB / LZH / ARJ / CPIO / AR / XAR / WIM, bandes dessinées, ISO / DMG et archives fractionnées (.001).",
        limits: "ALZ et EGG sont disponibles uniquement en extraction. La commande Compresser du Finder reste identique.",
        loadError: "Impossible de lire les applications par défaut.", applyError: "Impossible de modifier les applications par défaut.", retry: "Réessayer",
        success: "ZipLens est l’application par défaut pour les {count} types sélectionnés.", partial: "{success} types configurés. Échec pour {failed} types ; consultez les types signalés.",
        appRequired: "Pour modifier les réglages, ouvrez l’application ZipLens compilée, par exemple depuis le dossier Applications.", selected: "{count} sélectionnés", errorDetails: "Détails"
    },
    es: {
        title: "Aplicación de archivos predeterminada", close: "Cerrar", intro: "Al hacer doble clic en un archivo comprimido en Finder, se abre una vista previa en ZipLens 2.0.",
        selection: "Elegir tipos de archivo", all: "Seleccionar todo", none: "Borrar selección", current: "ZipLens predeterminado", other: "No predeterminado", unknown: "No se pudo comprobar", loading: "Comprobando aplicaciones…", applying: "Guardando ajustes…",
        apply: "Usar ZipLens para los tipos seleccionados", scope: "Los tipos marcados usarán ZipLens. Desmarcar no deshace los ajustes existentes. Las extensiones del mismo formato de macOS pueden cambiar juntas.",
        support: "Extracción: ZIP / 7Z / RAR / ALZ / EGG, TAR comprimido, CAB / LZH / ARJ / CPIO / AR / XAR / WIM, cómics, ISO / DMG y archivos divididos (.001).",
        limits: "ALZ y EGG solo permiten extracción. El comando Comprimir de Finder no cambia.",
        loadError: "No se pudieron consultar las aplicaciones predeterminadas.", applyError: "No se pudieron cambiar las aplicaciones predeterminadas.", retry: "Reintentar",
        success: "ZipLens es la aplicación predeterminada para los {count} tipos seleccionados.", partial: "Se configuraron {success} tipos. Fallaron {failed}; revisa los tipos señalados.",
        appRequired: "Para cambiar los ajustes, abre la aplicación ZipLens compilada, por ejemplo desde Aplicaciones.", selected: "{count} seleccionados", errorDetails: "Detalles"
    },
    ar: {
        title: "تطبيق الأرشيف الافتراضي", close: "إغلاق", intro: "عند النقر المزدوج على أرشيف في Finder، تفتح معاينته في ZipLens 2.0.",
        selection: "اختيار أنواع الملفات", all: "تحديد الكل", none: "إلغاء التحديد", current: "ZipLens هو الافتراضي", other: "ليس الافتراضي", unknown: "تعذر التحقق", loading: "جارٍ التحقق من التطبيقات…", applying: "جارٍ تغيير الإعدادات…",
        apply: "استخدام ZipLens للأنواع المحددة", scope: "ستستخدم الأنواع المحددة ZipLens. إلغاء التحديد لا يلغي الإعدادات الحالية. قد تتغير معاً الامتدادات التي يعتبرها macOS من التنسيق نفسه.",
        support: "فك الضغط: ZIP / 7Z / RAR / ALZ / EGG، وTAR المضغوط، وCAB / LZH / ARJ / CPIO / AR / XAR / WIM، وأرشيفات القصص المصورة، وISO / DMG، والأرشيفات المقسمة (.001).",
        limits: "يتوفر فك الضغط فقط لتنسيقَي ALZ وEGG. يظل أمر الضغط في Finder كما هو.",
        loadError: "تعذرت قراءة التطبيقات الافتراضية.", applyError: "تعذر تغيير التطبيقات الافتراضية.", retry: "إعادة المحاولة",
        success: "أصبح ZipLens التطبيق الافتراضي لعدد {count} من الأنواع المحددة.", partial: "تم إعداد {success} من الأنواع. تعذر إعداد {failed}؛ راجع الأنواع المعلّمة.",
        appRequired: "لتغيير الإعدادات، افتح تطبيق ZipLens المبني، مثلاً من مجلد التطبيقات.", selected: "تم تحديد {count}", errorDetails: "التفاصيل"
    }
} satisfies Record<LanguageCode, Record<string, string>>;

type Copy = typeof messages.en;
const nonArchiveDefaults = new Set(["iso", "dmg", "001", "jar", "apk", "exe", "msi", "deb", "rpm", "pkg"]);
let dialog: HTMLElement | null = null;
let closeCallback: (() => void) | undefined;
let initialized = false;

function interpolate(template: string, values: Record<string, number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

export function isFileAssociationsOpen(): boolean {
    return dialog !== null;
}

export function initFileAssociations(options: { onClose?: () => void } = {}): void {
    closeCallback = options.onClose;
    if (initialized) return;
    initialized = true;
    const button = document.getElementById("btn-file-associations");
    const updateLabel = () => {
        if (!button) return;
        const title = messages[getCurrentLang()].title;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.setAttribute("aria-haspopup", "dialog");
        const label = button.querySelector("span");
        if (label) label.textContent = title;
        else if (!button.querySelector("svg")) button.textContent = title;
    };
    updateLabel();
    new MutationObserver(updateLabel).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    button?.addEventListener("click", () => openFileAssociations());
    void listen("open_file_associations", () => openFileAssociations()).catch(error => {
        console.error("Could not register the file-associations menu event", error);
    });
}

export function openFileAssociations(): void {
    if (dialog) { dialog.focus(); return; }
    const app = document.getElementById("app");
    if (app?.inert || app?.dataset.processing === "true" || app?.dataset.actionBusy === "true") return;
    const copy: Copy = messages[getCurrentLang()];
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    const overlay = node("div", "file-associations-overlay");
    const panel = node("section", "file-associations-dialog");
    dialog = panel;
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "file-associations-title");
    panel.setAttribute("aria-describedby", "file-associations-intro");
    panel.dir = getCurrentLang() === "ar" ? "rtl" : "ltr";

    const header = node("header", "file-associations-header");
    const title = node("h2", "", copy.title);
    title.id = "file-associations-title";
    const closeIcon = node("button", "file-associations-close", "×");
    closeIcon.type = "button";
    closeIcon.setAttribute("aria-label", copy.close);
    header.append(title, closeIcon);
    const content = node("div", "file-associations-content");
    const intro = node("p", "file-associations-intro", copy.intro);
    intro.id = "file-associations-intro";
    const selectionHeader = node("div", "file-associations-selection-header");
    const selectionTitle = node("h3", "", copy.selection);
    const count = node("span", "file-associations-count");
    const chooseAll = node("button", "file-associations-text-button", copy.all);
    const clear = node("button", "file-associations-text-button", copy.none);
    chooseAll.type = clear.type = "button";
    selectionHeader.append(selectionTitle, count, chooseAll, clear);
    const list = node("div", "file-associations-list");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", copy.selection);
    const status = node("p", "file-associations-status", copy.loading);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const details = node("details", "file-associations-error-details");
    details.hidden = true;
    const detailsSummary = node("summary", "", copy.errorDetails);
    const errorText = node("pre", "");
    details.append(detailsSummary, errorText);
    const retry = node("button", "file-associations-text-button file-associations-retry", copy.retry);
    retry.type = "button";
    retry.hidden = true;
    const support = node("p", "file-associations-support", copy.support);
    const limits = node("p", "file-associations-support", copy.limits);
    content.append(intro, selectionHeader, list, status, details, retry, support, limits);
    const footer = node("footer", "file-associations-footer");
    const scope = node("p", "file-associations-scope", copy.scope);
    const actions = node("div", "file-associations-actions");
    const close = node("button", "file-associations-button", copy.close);
    const apply = node("button", "file-associations-button file-associations-primary", copy.apply);
    close.type = apply.type = "button";
    actions.append(close, apply);
    footer.append(scope, actions);
    panel.append(header, content, footer);
    overlay.append(panel);
    document.body.append(overlay);

    let busy = false;
    let loading = true;
    let statuses: FileAssociationStatus[] = [];
    let selected = new Set<string>();

    const updateActions = () => {
        apply.disabled = busy || loading || selected.size === 0;
        apply.textContent = busy ? copy.applying : copy.apply;
        chooseAll.disabled = clear.disabled = busy || loading || statuses.length === 0;
        close.disabled = closeIcon.disabled = busy;
        list.querySelectorAll<HTMLInputElement>("input").forEach(input => { input.disabled = busy; });
        count.textContent = interpolate(copy.selected, { count: selected.size });
        panel.setAttribute("aria-busy", String(busy || loading));
    };

    const showStatus = (text: string, kind: "error" | "success" | "neutral" = "neutral", detail = "") => {
        status.textContent = text;
        status.dataset.kind = kind;
        errorText.textContent = detail;
        details.hidden = !detail;
        details.open = false;
    };

    const renderList = () => {
        list.replaceChildren();
        for (const item of statuses) {
            const row = node("label", "file-associations-row");
            row.classList.toggle("has-error", !!item.error);
            const checkbox = node("input", "");
            checkbox.type = "checkbox";
            checkbox.value = item.extension;
            checkbox.checked = selected.has(item.extension);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) selected.add(item.extension);
                else selected.delete(item.extension);
                updateActions();
            });
            const extension = node("span", "file-associations-extension", `.${item.extension}`);
            extension.dir = "ltr";
            const indicator = node("span", "file-associations-indicator", item.is_default ? copy.current : item.error ? copy.unknown : copy.other);
            indicator.classList.toggle("is-default", item.is_default);
            if (item.error) { indicator.textContent = `⚠ ${indicator.textContent}`; row.title = item.error; }
            row.append(checkbox, extension, indicator);
            list.append(row);
        }
        updateActions();
    };

    const load = async () => {
        loading = true;
        retry.hidden = true;
        showStatus(copy.loading);
        updateActions();
        try {
            const result = await invoke<FileAssociationStatus[]>("get_file_associations");
            if (dialog !== panel) return;
            statuses = result.filter(item => !nonArchiveDefaults.has(item.extension.toLowerCase()));
            selected = new Set(statuses.map(item => item.extension));
            const errors = statuses.filter(item => item.error);
            showStatus(errors.length ? copy.loadError : "", errors.length ? "error" : "neutral", errors.map(item => `.${item.extension}: ${item.error}`).join("\n"));
            renderList();
        } catch (error) {
            if (dialog !== panel) return;
            showStatus(copy.loadError, "error", String(error));
            retry.hidden = false;
        } finally {
            if (dialog === panel) { loading = false; updateActions(); }
        }
    };

    apply.addEventListener("click", async () => {
        if (busy || loading || !selected.size) return;
        const requested = [...selected];
        busy = true;
        showStatus(copy.applying);
        updateActions();
        try {
            const result = await invoke<FileAssociationStatus[]>("set_default_file_associations", { extensions: requested });
            statuses = result.filter(item => !nonArchiveDefaults.has(item.extension.toLowerCase()));
            const successes = requested.filter(extension => result.some(item => item.extension === extension && item.is_default && !item.error)).length;
            const failed = requested.length - successes;
            const errors = result.filter(item => requested.includes(item.extension) && item.error);
            showStatus(failed ? interpolate(copy.partial, { success: successes, failed }) : interpolate(copy.success, { count: successes }), failed ? "error" : "success", errors.map(item => `.${item.extension}: ${item.error}`).join("\n"));
            renderList();
        } catch (error) {
            const detail = String(error);
            const appRequired = /APP_BUNDLE_REQUIRED|\.app|app bundle/i.test(detail);
            showStatus(appRequired ? copy.appRequired : copy.applyError, "error", detail);
        } finally {
            busy = false;
            updateActions();
        }
    });

    const dismiss = () => {
        if (busy) return;
        dialog = null;
        overlay.remove();
        document.removeEventListener("keydown", keydown, true);
        if (app) app.inert = wasInert;
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
        closeCallback?.();
    };
    const keydown = (event: KeyboardEvent) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
        if (event.key !== "Tab") return;
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary"))
            .filter(element => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) { event.preventDefault(); panel.focus(); return; }
        if (!panel.contains(document.activeElement) || document.activeElement === panel) {
            event.preventDefault(); (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
        }
    };
    close.addEventListener("click", dismiss);
    closeIcon.addEventListener("click", dismiss);
    chooseAll.addEventListener("click", () => { selected = new Set(statuses.map(item => item.extension)); renderList(); });
    clear.addEventListener("click", () => { selected.clear(); renderList(); });
    retry.addEventListener("click", () => { void load(); });
    document.addEventListener("keydown", keydown, true);
    updateActions();
    closeIcon.focus();
    void load();
}
