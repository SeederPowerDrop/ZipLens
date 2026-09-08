import type { LanguageCode } from "./i18n";

interface AboutCopy {
    title: string;
    close: string;
    support: string;
    paragraphs: readonly [string, string, string, string, string];
}

// The Korean introduction is the author's original. Other languages accompany it.
const aboutCopy: Record<LanguageCode, AboutCopy> = {
    ko: {
        title: "ZipLens 2.0 정보", close: "확인", support: "후원하기",
        paragraphs: [
            "안녕하세요, SeederPowerDrop입니다.",
            "macOS에 쓰이는 압축 프로그램이 불편한 와중에 바이브코딩을 알게 되어서 직접 만들어 봤습니다.\n그래서 직접 만들어본 ZipLens입니다.\n다른 Mac용 압축 프로그램과 달리 불편하지 않으면서 비용도 들지 않게 만들어 봤습니다.",
            "ZipLens라는 이름은 Lens는 빛을 압축시키기도(Convergence) 발산시키기도(Divergence) 합니다.\n그래서 Lens를 압축 프로그램에 빗대어 만들어 봤습니다.",
            "모두 다 잘 사용했으면 합니다.",
            "감사합니다."
        ]
    },
    en: {
        title: "About ZipLens 2.0", close: "OK", support: "Support the project",
        paragraphs: [
            "Hello, I'm SeederPowerDrop.",
            "I found the archive apps available for macOS inconvenient. When I discovered vibe coding, I decided to make one myself.\nThe result is ZipLens.\nI wanted to make a Mac archive app that is easy to use and free of charge.",
            "The name ZipLens comes from the way a lens can bring light together (convergence) or spread it out (divergence).\nI used that idea as a metaphor for compressing and extracting files.",
            "I hope everyone finds it useful.",
            "Thank you."
        ]
    },
    ja: {
        title: "ZipLens 2.0 について", close: "確認", support: "開発を支援する",
        paragraphs: [
            "こんにちは、SeederPowerDropです。",
            "macOSの圧縮ソフトに使いにくさを感じていたところ、バイブコーディングを知り、自分で作ってみることにしました。\nそうしてできたのがZipLensです。\nMacで使いやすく、無料で利用できる圧縮ソフトを目指して作りました。",
            "ZipLensという名前は、レンズが光を集めたり（収束）、広げたり（発散）することに由来します。\nその働きをファイルの圧縮と解凍になぞらえました。",
            "皆さんのお役に立てればうれしいです。",
            "ありがとうございます。"
        ]
    },
    zh: {
        title: "关于 ZipLens 2.0", close: "确定", support: "支持开发",
        paragraphs: [
            "大家好，我是 SeederPowerDrop。",
            "我觉得 macOS 上的压缩软件用起来不太方便。接触到氛围编程（vibe coding）后，我决定自己做一个。\n于是就有了 ZipLens。\n我希望做出一款在 Mac 上既好用又免费的压缩软件。",
            "ZipLens 这个名字源于透镜可以让光线汇聚（Convergence），也可以让光线发散（Divergence）。\n我用透镜的这种特性来比喻文件的压缩与解压。",
            "希望它能为大家带来便利。",
            "谢谢大家。"
        ]
    },
    fr: {
        title: "À propos de ZipLens 2.0", close: "OK", support: "Soutenir le projet",
        paragraphs: [
            "Bonjour, je suis SeederPowerDrop.",
            "Je trouvais les logiciels de compression pour macOS peu pratiques. En découvrant le vibe coding, j'ai décidé d'en créer un moi-même.\nC'est ainsi qu'est né ZipLens.\nJe voulais proposer un logiciel de compression pour Mac facile à utiliser et gratuit.",
            "Le nom ZipLens vient de la capacité d'une lentille à concentrer la lumière (convergence) ou à la disperser (divergence).\nJ'ai repris cette idée pour représenter la compression et l'extraction des fichiers.",
            "J'espère que ce logiciel vous sera utile.",
            "Merci."
        ]
    },
    es: {
        title: "Acerca de ZipLens 2.0", close: "Aceptar", support: "Apoyar el proyecto",
        paragraphs: [
            "Hola, soy SeederPowerDrop.",
            "Los programas de compresión para macOS me resultaban poco prácticos. Cuando descubrí el vibe coding, decidí crear uno por mi cuenta.\nAsí nació ZipLens.\nQuería ofrecer un programa de compresión para Mac fácil de usar y gratuito.",
            "El nombre ZipLens se inspira en cómo una lente puede concentrar la luz (convergencia) o dispersarla (divergencia).\nUtilicé esa idea como metáfora de la compresión y la extracción de archivos.",
            "Espero que les resulte útil.",
            "Gracias."
        ]
    },
    ar: {
        title: "حول ZipLens 2.0", close: "موافق", support: "دعم المشروع",
        paragraphs: [
            "مرحبًا، أنا SeederPowerDrop.",
            "وجدت أن برامج ضغط الملفات على macOS غير مريحة في الاستخدام. وعندما تعرّفت على البرمجة بمساعدة الذكاء الاصطناعي (vibe coding)، قررت إنشاء برنامج بنفسي.\nوهكذا ظهر ZipLens.\nأردت إنشاء برنامج لضغط الملفات على Mac يكون سهل الاستخدام ومجانيًا.",
            "اسم ZipLens مستوحى من قدرة العدسة على تجميع الضوء (التقارب) أو نشره (التباعد).\nواستخدمت هذه الفكرة للتعبير عن ضغط الملفات وفك ضغطها.",
            "آمل أن يكون مفيدًا للجميع.",
            "شكرًا لكم."
        ]
    }
};

export function updateAboutIntroduction(lang: LanguageCode) {
    const container = document.getElementById("about-introduction");
    if (!container) return;
    const copy = aboutCopy[lang];
    const bilingual = (korean: string, localized: string) => lang === "ko" ? korean : `${korean} / ${localized}`;
    container.replaceChildren();
    aboutCopy.ko.paragraphs.forEach((korean, index) => {
        const pair = document.createElement("div");
        pair.className = "about-paragraph-pair";
        const original = document.createElement("p");
        original.lang = "ko";
        original.dir = "ltr";
        original.textContent = korean;
        pair.appendChild(original);
        if (lang !== "ko") {
            const translation = document.createElement("p");
            translation.className = "about-translation";
            translation.lang = lang;
            translation.dir = lang === "ar" ? "rtl" : "ltr";
            translation.textContent = copy.paragraphs[index];
            pair.appendChild(translation);
        }
        container.appendChild(pair);
    });
    const title = document.getElementById("about-title");
    if (title) title.textContent = bilingual(aboutCopy.ko.title, copy.title);
    const close = document.getElementById("about-close");
    if (close) close.textContent = bilingual(aboutCopy.ko.close, copy.close);
    const support = document.getElementById("about-support-label");
    if (support) support.textContent = `☕ ${bilingual(aboutCopy.ko.support, copy.support)} (Buy Me A Coffee)`;
    // The personal dedication lives outside this translated content, untouched.
}
