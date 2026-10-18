import type { LanguageCode } from "./i18n";
import { getUserGuideUrl } from "./guide-navigation";

interface AboutCopy {
    title: string;
    tagline: string;
    dedicationPrefix: string;
    close: string;
    support: string;
    supportMessage: string;
    bitcoinHint: string;
    bitcoinAddress: string;
    bitcoinQr: string;
    copyAddress: string;
    addressCopied: string;
    copyManually: string;
    userGuide: string;
    userGuideHint: string;
    licenses: string;
    licensesHint: string;
    licensesError: string;
    paragraphs: readonly [string, string, string, string, string, string];
}

// Keep the author's Korean original, and show only the selected app language.
const aboutCopy: Record<LanguageCode, AboutCopy> = {
    ko: {
        title: "ZipLens 정보", close: "확인", support: "후원하기",
        tagline: "누구나 자유롭게 쓰는 macOS 압축 도구.",
        supportMessage: "제가 받은 도움을 다시 나누는 마음으로, 누구나 무료로 쓸 수 있는 도구를 만듭니다. 유용하게 쓰셨다면 작은 후원으로 응원해 주세요.",
        bitcoinHint: "BlueWallet은 제가 사용하는 지갑 앱입니다. Bitcoin 네트워크를 지원하는 다른 지갑에서도 이 주소나 QR 코드로 후원할 수 있습니다.",
        bitcoinAddress: "비트코인 수신 주소", bitcoinQr: "비트코인 후원용 QR 코드", copyAddress: "주소 복사",
        addressCopied: "주소를 복사했습니다.", copyManually: "자동 복사가 되지 않았습니다. 선택된 주소를 직접 복사해 주세요.",
        dedicationPrefix: "그리고",
        userGuide: "사용 가이드", userGuideHint: "사용 방법과 주요 기능을 확인합니다.",
        licenses: "오픈소스 라이선스", licensesHint: "라이선스와 소스 코드 안내가 담긴 폴더를 Finder에서 엽니다.", licensesError: "오픈소스 라이선스 폴더를 열지 못했습니다.",
        paragraphs: [
            "안녕하세요, SeederPowerDrop입니다.",
            "macOS 압축 프로그램을 쓰며 느꼈던 불편함을 줄이고 싶었습니다. 바이브코딩을 알게 된 뒤, 쉽고 무료로 쓸 수 있는 ZipLens를 직접 만들었습니다.",
            "ZipLens라는 이름은 빛을 모으거나 퍼뜨리는 렌즈에서 따왔습니다. 그 모습을 파일의 압축과 해제에 빗대었습니다.",
            "우리가 나눈 지식이 누군가의 시작이 되듯, 제가 만든 도구도 누군가의 가능성을 넓혀 주기를 바랍니다. 사람과 AI 모두 기본적인 디지털 도구를 자유롭게 쓰며, 함께 배우고 만들어 갈 수 있었으면 합니다.",
            "모두에게 편리하고 유용한 도구가 되기를 바랍니다.",
            "감사합니다."
        ]
    },
    en: {
        title: "About ZipLens", close: "OK", support: "Support the project",
        tagline: "A free archive tool for macOS.",
        supportMessage: "To pass on the help I’ve received, I make tools anyone can use for free. If you find them useful, please consider supporting my work with a small contribution.",
        bitcoinHint: "BlueWallet is the wallet app I use. This Bitcoin address and QR code also work with other wallets that support the Bitcoin network.",
        bitcoinAddress: "Bitcoin receiving address", bitcoinQr: "QR code for Bitcoin support", copyAddress: "Copy address",
        addressCopied: "Address copied.", copyManually: "Automatic copying failed. Please copy the selected address manually.",
        dedicationPrefix: "And",
        userGuide: "User guide", userGuideHint: "Explore how to use ZipLens and its main features.",
        licenses: "Open-source licenses", licensesHint: "Open the folder containing licenses and source-code information in Finder.", licensesError: "Could not open the open-source licenses folder.",
        paragraphs: [
            "Hello, I'm SeederPowerDrop.",
            "I found macOS archive apps awkward to use. After discovering vibe coding, I built ZipLens to offer a simple, free way to compress and extract files.",
            "The name ZipLens comes from how a lens gathers or spreads light—a metaphor for compressing and extracting files.",
            "Just as the knowledge we share can help someone get started, I hope the tools I make open up new possibilities for others. I hope people and AI alike can freely use basic digital tools to learn and create together.",
            "I hope everyone finds it useful.",
            "Thank you."
        ]
    },
    ja: {
        title: "ZipLensについて", close: "確認", support: "開発を支援する",
        tagline: "誰でも無料で使えるmacOS用圧縮ツール。",
        supportMessage: "これまでいただいた助けを誰かにつなげる気持ちで、誰もが無料で使えるツールを作っています。お役に立てたら、少額のご支援で応援していただけるとうれしいです。",
        bitcoinHint: "BlueWalletは私が使用しているウォレットアプリです。Bitcoinネットワークに対応したほかのウォレットからも、このアドレスやQRコードでご支援いただけます。",
        bitcoinAddress: "Bitcoin受取アドレス", bitcoinQr: "Bitcoinで支援するためのQRコード", copyAddress: "アドレスをコピー",
        addressCopied: "アドレスをコピーしました。", copyManually: "自動コピーできませんでした。選択されたアドレスを手動でコピーしてください。",
        dedicationPrefix: "そして",
        userGuide: "使い方ガイド", userGuideHint: "使い方と主な機能を確認します。",
        licenses: "オープンソースライセンス", licensesHint: "ライセンスとソースコードの案内が入ったフォルダをFinderで開きます。", licensesError: "オープンソースライセンスのフォルダを開けませんでした。",
        paragraphs: [
            "こんにちは、SeederPowerDropです。",
            "macOSの圧縮ソフトに使いにくさを感じていました。バイブコーディングを知り、使いやすく無料で利用できるソフトを目指してZipLensを作りました。",
            "ZipLensという名前は、光を集めたり広げたりするレンズに由来します。その働きをファイルの圧縮と解凍になぞらえました。",
            "私たちが分かち合った知識が誰かの第一歩になるように、私の作るツールも誰かの可能性を広げるものになればと願っています。人もAIも基本的なデジタルツールを自由に使い、ともに学び、作っていけたらうれしいです。",
            "皆さんのお役に立てればうれしいです。",
            "ありがとうございます。"
        ]
    },
    zh: {
        title: "关于 ZipLens", close: "确定", support: "支持开发",
        tagline: "人人可免费使用的 macOS 压缩工具。",
        supportMessage: "为了把我得到的帮助传递下去，我制作人人都能免费使用的工具。如果它们对您有用，欢迎以小额捐助支持我的开发工作。",
        bitcoinHint: "BlueWallet 是我使用的钱包应用。其他支持比特币网络的钱包也可以通过此地址或二维码进行捐助。",
        bitcoinAddress: "比特币收款地址", bitcoinQr: "比特币支持二维码", copyAddress: "复制地址",
        addressCopied: "地址已复制。", copyManually: "自动复制失败，请手动复制已选中的地址。",
        dedicationPrefix: "还有",
        userGuide: "使用指南", userGuideHint: "了解使用方法和主要功能。",
        licenses: "开源许可证", licensesHint: "在 Finder 中打开包含许可证和源代码说明的文件夹。", licensesError: "无法打开开源许可证文件夹。",
        paragraphs: [
            "大家好，我是 SeederPowerDrop。",
            "我觉得 macOS 上的压缩软件不太好用。接触到氛围编程（vibe coding）后，我制作了 ZipLens，希望让文件压缩和解压变得简单、免费。",
            "ZipLens 这个名字源于透镜汇聚和发散光线的特性，我用它来比喻文件的压缩与解压。",
            "正如我们分享的知识能帮助他人迈出第一步，我也希望自己制作的工具能为他人打开更多可能。希望人与 AI 都能自由使用基本的数字工具，一起学习、一起创造。",
            "希望它能为大家带来便利。",
            "谢谢大家。"
        ]
    },
    vi: {
        title: "Giới thiệu về ZipLens", close: "Đóng", support: "Ủng hộ dự án",
        tagline: "Công cụ nén và giải nén miễn phí cho macOS.",
        supportMessage: "Tôi làm những công cụ mà ai cũng có thể dùng miễn phí, với mong muốn trao đi sự giúp đỡ mình đã nhận được. Nếu thấy hữu ích, bạn có thể ủng hộ bằng một khoản đóng góp nhỏ.",
        bitcoinHint: "BlueWallet là ứng dụng ví tôi sử dụng. Bạn cũng có thể dùng địa chỉ hoặc mã QR này để ủng hộ từ các ví khác hỗ trợ mạng Bitcoin.",
        bitcoinAddress: "Địa chỉ nhận Bitcoin", bitcoinQr: "Mã QR để ủng hộ bằng Bitcoin", copyAddress: "Sao chép địa chỉ",
        addressCopied: "Đã sao chép địa chỉ.", copyManually: "Không thể sao chép tự động. Vui lòng sao chép thủ công địa chỉ đã chọn.",
        dedicationPrefix: "Và",
        userGuide: "Hướng dẫn sử dụng", userGuideHint: "Tìm hiểu cách sử dụng và các tính năng chính.",
        licenses: "Giấy phép nguồn mở", licensesHint: "Mở thư mục chứa giấy phép và thông tin về mã nguồn trong Finder.", licensesError: "Không thể mở thư mục giấy phép nguồn mở.",
        paragraphs: [
            "Xin chào, tôi là SeederPowerDrop.",
            "Tôi thấy các ứng dụng nén và giải nén trên macOS khá bất tiện. Khi biết đến vibe coding, tôi đã tạo ZipLens để việc nén và giải nén tệp trở nên đơn giản và miễn phí.",
            "Tên ZipLens lấy cảm hứng từ khả năng hội tụ hoặc phân kỳ ánh sáng của thấu kính, như một phép ví von cho việc nén và giải nén tệp.",
            "Cũng như kiến thức chúng ta chia sẻ có thể giúp ai đó bắt đầu, tôi mong những công cụ mình làm ra cũng mở ra những khả năng mới cho người khác. Tôi mong con người và AI đều có thể tự do sử dụng các công cụ số cơ bản để cùng học hỏi và sáng tạo.",
            "Mong rằng ứng dụng này sẽ hữu ích với mọi người.",
            "Xin cảm ơn."
        ]
    },
    fr: {
        title: "À propos de ZipLens", close: "OK", support: "Soutenir le projet",
        tagline: "Un outil d’archivage gratuit pour macOS.",
        supportMessage: "Pour transmettre à mon tour l’aide que j’ai reçue, je crée des outils gratuits pour tous. S’ils vous sont utiles, vous pouvez soutenir mon travail par un petit don.",
        bitcoinHint: "BlueWallet est l’application de portefeuille que j’utilise. Cette adresse et ce code QR permettent aussi de contribuer depuis d’autres portefeuilles compatibles avec le réseau Bitcoin.",
        bitcoinAddress: "Adresse de réception Bitcoin", bitcoinQr: "Code QR pour contribuer en Bitcoin", copyAddress: "Copier l’adresse",
        addressCopied: "Adresse copiée.", copyManually: "La copie automatique a échoué. Copiez manuellement l’adresse sélectionnée.",
        dedicationPrefix: "Et",
        userGuide: "Guide d’utilisation", userGuideHint: "Découvrez le fonctionnement et les principales fonctionnalités.",
        licenses: "Licences open source", licensesHint: "Ouvrir dans le Finder le dossier des licences et des informations sur le code source.", licensesError: "Impossible d’ouvrir le dossier des licences open source.",
        paragraphs: [
            "Bonjour, je suis SeederPowerDrop.",
            "Je trouvais les logiciels de compression pour macOS peu pratiques. Après avoir découvert le vibe coding, j’ai créé ZipLens pour compresser et extraire des fichiers simplement et gratuitement.",
            "Le nom ZipLens évoque une lentille qui concentre ou disperse la lumière, une image de la compression et de l’extraction des fichiers.",
            "Tout comme les connaissances que nous partageons peuvent aider quelqu’un à faire ses premiers pas, j’espère que mes outils ouvriront de nouvelles possibilités à d’autres. J’aimerais que les humains comme l’IA puissent utiliser librement les outils numériques de base pour apprendre et créer ensemble.",
            "J’espère que ce logiciel vous sera utile.",
            "Merci."
        ]
    },
    es: {
        title: "Acerca de ZipLens", close: "Aceptar", support: "Apoyar el proyecto",
        tagline: "Una app gratuita para comprimir y extraer archivos en macOS.",
        supportMessage: "Para ofrecer a otros la ayuda que yo he recibido, creo herramientas que cualquiera puede usar gratis. Si te resultan útiles, puedes apoyar mi trabajo con una pequeña aportación.",
        bitcoinHint: "BlueWallet es la aplicación de monedero que uso. Esta dirección y este código QR también permiten contribuir desde otros monederos compatibles con la red Bitcoin.",
        bitcoinAddress: "Dirección para recibir Bitcoin", bitcoinQr: "Código QR para contribuir con Bitcoin", copyAddress: "Copiar dirección",
        addressCopied: "Dirección copiada.", copyManually: "No se pudo copiar automáticamente. Copia la dirección seleccionada manualmente.",
        dedicationPrefix: "Y",
        userGuide: "Guía de uso", userGuideHint: "Consulta cómo usar ZipLens y sus funciones principales.",
        licenses: "Licencias de código abierto", licensesHint: "Abrir en Finder la carpeta con las licencias y la información del código fuente.", licensesError: "No se pudo abrir la carpeta de licencias de código abierto.",
        paragraphs: [
            "Hola, soy SeederPowerDrop.",
            "Los programas de compresión para macOS me resultaban poco prácticos. Al descubrir el vibe coding, creé ZipLens para comprimir y extraer archivos de forma sencilla y gratuita.",
            "El nombre ZipLens se inspira en cómo una lente concentra o dispersa la luz, como metáfora de la compresión y la extracción de archivos.",
            "Así como el conocimiento que compartimos puede ayudar a alguien a dar sus primeros pasos, espero que mis herramientas abran nuevas posibilidades para otras personas. Me gustaría que las personas y la IA pudieran usar libremente las herramientas digitales básicas para aprender y crear juntas.",
            "Espero que te resulte útil.",
            "Gracias."
        ]
    },
    de: {
        title: "Über ZipLens", close: "OK", support: "Projekt unterstützen",
        tagline: "Ein kostenloses Archivprogramm für macOS.",
        supportMessage: "Um die Hilfe weiterzugeben, die ich erhalten habe, entwickle ich Tools, die alle kostenlos nutzen können. Wenn sie Ihnen helfen, können Sie meine Arbeit mit einem kleinen Beitrag unterstützen.",
        bitcoinHint: "BlueWallet ist die Wallet-App, die ich verwende. Mit dieser Adresse oder diesem QR-Code können Sie auch aus anderen Wallets spenden, die das Bitcoin-Netzwerk unterstützen.",
        bitcoinAddress: "Bitcoin-Empfangsadresse", bitcoinQr: "QR-Code für eine Unterstützung mit Bitcoin", copyAddress: "Adresse kopieren",
        addressCopied: "Adresse kopiert.", copyManually: "Die Adresse konnte nicht automatisch kopiert werden. Bitte kopieren Sie die ausgewählte Adresse manuell.",
        dedicationPrefix: "Und",
        userGuide: "Benutzerhandbuch", userGuideHint: "Mehr zur Verwendung und den wichtigsten Funktionen erfahren.",
        licenses: "Open-Source-Lizenzen", licensesHint: "Den Ordner mit Lizenzen und Informationen zum Quellcode im Finder öffnen.", licensesError: "Der Ordner mit den Open-Source-Lizenzen konnte nicht geöffnet werden.",
        paragraphs: [
            "Hallo, ich bin SeederPowerDrop.",
            "Ich fand die Archivprogramme für macOS umständlich. Nachdem ich Vibe Coding entdeckt hatte, entwickelte ich ZipLens, um Dateien einfach und kostenlos zu komprimieren und zu entpacken.",
            "Der Name ZipLens bezieht sich auf eine Linse, die Licht bündelt oder streut – als Bild für das Komprimieren und Entpacken von Dateien.",
            "So wie unser geteiltes Wissen jemandem den Einstieg erleichtern kann, hoffe ich, dass meine Werkzeuge anderen neue Möglichkeiten eröffnen. Ich wünsche mir, dass Menschen und KI grundlegende digitale Werkzeuge frei nutzen können, um gemeinsam zu lernen und Neues zu schaffen.",
            "Ich hoffe, dass das Programm allen gute Dienste leistet.",
            "Vielen Dank."
        ]
    },
    ru: {
        title: "О ZipLens", close: "ОК", support: "Поддержать проект",
        tagline: "Бесплатный архиватор для macOS.",
        supportMessage: "Я создаю бесплатные для всех инструменты, чтобы передать дальше помощь, которую получил сам. Если они вам полезны, вы можете поддержать мою работу небольшим пожертвованием.",
        bitcoinHint: "BlueWallet — приложение-кошелёк, которым я пользуюсь. Этот адрес и QR-код также подходят для переводов из других кошельков, поддерживающих сеть Биткоин.",
        bitcoinAddress: "Адрес для получения биткоинов", bitcoinQr: "QR-код для поддержки биткоинами", copyAddress: "Скопировать адрес",
        addressCopied: "Адрес скопирован.", copyManually: "Не удалось скопировать адрес автоматически. Скопируйте выделенный адрес вручную.",
        dedicationPrefix: "И ещё",
        userGuide: "Руководство пользователя", userGuideHint: "Узнайте, как пользоваться приложением и его основными функциями.",
        licenses: "Лицензии открытого ПО", licensesHint: "Открыть в Finder папку с лицензиями и информацией об исходном коде.", licensesError: "Не удалось открыть папку с лицензиями открытого ПО.",
        paragraphs: [
            "Здравствуйте, я SeederPowerDrop.",
            "Архиваторы для macOS казались мне неудобными. Познакомившись с вайб-кодингом, я создал ZipLens, чтобы сжимать и распаковывать файлы было просто и бесплатно.",
            "Название ZipLens связано со способностью линзы собирать или рассеивать свет — это метафора сжатия и распаковки файлов.",
            "Знания, которыми мы делимся, могут стать для кого-то началом пути, и я надеюсь, что мои инструменты тоже откроют кому-то новые возможности. Мне бы хотелось, чтобы люди и ИИ могли свободно пользоваться базовыми цифровыми инструментами, учиться и создавать вместе.",
            "Надеюсь, приложение будет полезно всем.",
            "Спасибо."
        ]
    },
    ar: {
        title: "حول ZipLens", close: "موافق", support: "دعم المشروع",
        tagline: "أداة مجانية لضغط الملفات وفكّها على macOS.",
        supportMessage: "امتنانًا للمساعدة التي تلقيتها، أصنع أدوات مجانية للجميع لأقدّم العون بدوري. إذا وجدتها مفيدة، يمكنك دعمي بمساهمة صغيرة.",
        bitcoinHint: "BlueWallet هو تطبيق المحفظة الذي أستخدمه. يمكنك أيضًا استخدام هذا العنوان أو رمز QR للدعم من محافظ أخرى تدعم شبكة بيتكوين.",
        bitcoinAddress: "عنوان استقبال بيتكوين", bitcoinQr: "رمز QR للدعم ببيتكوين", copyAddress: "نسخ العنوان",
        addressCopied: "تم نسخ العنوان.", copyManually: "تعذر النسخ تلقائيًا. يرجى نسخ العنوان المحدد يدويًا.",
        dedicationPrefix: "وأيضًا",
        userGuide: "دليل الاستخدام", userGuideHint: "تعرّف على طريقة الاستخدام والميزات الرئيسية.",
        licenses: "تراخيص المصادر المفتوحة", licensesHint: "فتح المجلد الذي يحتوي على التراخيص ومعلومات الشفرة المصدرية في Finder.", licensesError: "تعذر فتح مجلد تراخيص المصادر المفتوحة.",
        paragraphs: [
            "مرحبًا، أنا SeederPowerDrop.",
            "وجدت برامج ضغط الملفات على macOS غير مريحة. وبعد تعرّفي على البرمجة بمساعدة الذكاء الاصطناعي (vibe coding)، أنشأت ZipLens لتسهيل ضغط الملفات وفك ضغطها مجانًا.",
            "اسم ZipLens مستوحى من قدرة العدسة على تجميع الضوء أو نشره، تشبيهًا بضغط الملفات وفك ضغطها.",
            "كما قد تصبح المعرفة التي نتشاركها بدايةً لشخص ما، آمل أن تفتح الأدوات التي صنعتها آفاقًا أوسع لغيري. أتمنى أن يتمكن البشر والذكاء الاصطناعي من استخدام الأدوات الرقمية الأساسية بحرية، والتعلّم والإبداع معًا.",
            "آمل أن يكون مفيدًا للجميع.",
            "شكرًا لكم."
        ]
    }
};

export function updateAboutIntroduction(lang: LanguageCode) {
    const container = document.getElementById("about-introduction");
    if (!container) return;
    const copy = aboutCopy[lang];
    const modal = document.getElementById("about-modal");
    if (modal) {
        modal.lang = lang;
        modal.dir = lang === "ar" ? "rtl" : "ltr";
    }
    container.replaceChildren();
    copy.paragraphs.forEach(text => {
        const paragraph = document.createElement("p");
        paragraph.className = "about-paragraph";
        paragraph.textContent = text;
        container.appendChild(paragraph);
    });
    const title = document.getElementById("about-title");
    if (title) title.textContent = copy.title;
    const tagline = document.getElementById("about-tagline");
    if (tagline) tagline.textContent = copy.tagline;
    const info = document.getElementById("btn-about");
    if (info) {
        info.title = copy.title;
        info.setAttribute("aria-label", copy.title);
    }
    const close = document.getElementById("about-close");
    if (close) close.textContent = copy.close;
    const supportLabels = {
        "about-support-title": copy.support,
        "about-support-message": copy.supportMessage,
        "about-bitcoin-hint": copy.bitcoinHint,
        "about-bitcoin-address-label": copy.bitcoinAddress,
        "about-bitcoin-copy": copy.copyAddress,
        "about-bitcoin-status": ""
    };
    for (const [id, text] of Object.entries(supportLabels)) {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    }
    document.getElementById("about-support-label")?.setAttribute("aria-label", `${copy.support} — Buy Me a Coffee`);
    document.getElementById("about-kofi-link")?.setAttribute("aria-label", `${copy.support} — Ko-fi`);
    document.getElementById("about-bitcoin-toggle")?.setAttribute("aria-label", `${copy.support} — BlueWallet · Bitcoin (BTC)`);
    document.getElementById("about-bitcoin-qr")?.setAttribute("alt", copy.bitcoinQr);
    for (const id of ["about-user-guide", "home-user-guide"]) {
        const userGuide = document.getElementById(id);
        if (userGuide) {
            userGuide.textContent = copy.userGuide;
            userGuide.title = copy.userGuideHint;
            userGuide.setAttribute("href", getUserGuideUrl(lang));
        }
    }
    const licenses = document.getElementById("about-licenses");
    if (licenses) {
        licenses.textContent = copy.licenses;
        licenses.title = copy.licensesHint;
    }
    const licensesHint = document.getElementById("about-licenses-hint");
    if (licensesHint) licensesHint.textContent = copy.licensesHint;
    document.getElementById("about-close-x")?.setAttribute("aria-label", copy.close);
    const dedicationPrefix = document.getElementById("about-dedication-prefix");
    if (dedicationPrefix) dedicationPrefix.textContent = copy.dedicationPrefix;
    // Only the connecting word is translated; the personal message stays intact.
}

export function getAboutLicenseError(lang: LanguageCode): string {
    return aboutCopy[lang].licensesError;
}

export async function copyBitcoinAddress(lang: LanguageCode): Promise<void> {
    const address = document.getElementById("about-bitcoin-address") as HTMLTextAreaElement | null;
    const status = document.getElementById("about-bitcoin-status");
    if (!address || !status) return;
    const copy = aboutCopy[lang];
    let copied = false;
    try {
        // Start the clipboard request directly in the user's click handler.
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(address.value);
            copied = true;
        }
    } catch {
        // A selectable address also works when the WebView denies clipboard access.
    }
    if (!copied) {
        address.focus();
        address.select();
        try {
            copied = document.execCommand("copy");
        } catch {
            // Keep the address selected for the native Copy menu or keyboard shortcut.
        }
    }
    status.textContent = copied ? copy.addressCopied : copy.copyManually;
}
