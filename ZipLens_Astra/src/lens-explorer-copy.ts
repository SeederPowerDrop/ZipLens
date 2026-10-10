import type { LanguageCode } from "./i18n";
import type { LensId } from "./lens-explorer-model";

export interface LensCopy {
    name: string;
    description: string;
}

export interface ExplorerCopy {
    activateHint: string;
    nextHint: string;
    diagramNote: string;
    backToPair: string;
    pairTitle: string;
}

// Primary references for the conceptual diagrams and short descriptions.
export const lensLearningSources = {
    geometries: "https://www.edmundoptics.com/knowledge-center/application-notes/optics/understanding-optical-lens-geometries/",
    concave: "https://www.thorlabs.com/catalogpages/Obsolete/2024/LD5313-E.pdf",
    convex: "https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=123&pn=LA4006",
    planoConcave: "https://www.thorlabs.com/catalogpages/710.pdf",
    biConvex: "https://www.thorlabs.com/n-bk7-bi-convex-lenses-ar-coating-400---1100-nm",
    meniscus: "https://www.edmundoptics.com/f/meniscus-lenses/40150/",
    achromatic: "https://www.edmundoptics.com/knowledge-center/application-notes/optics/why-use-an-achromatic-lens/",
    apochromat: "https://www.edmundoptics.com/knowledge-center/application-notes/imaging/how-aberrations-affect-machine-vision-lenses/",
    apochromatElements: "https://www.edmundoptics.com/knowledge-center/application-notes/microscopy/understanding-microscopes-and-objectives/",
    axicon: "https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=4277&pn=AX251-UV",
    bessel: "https://www.edmundoptics.com/knowledge-center/application-notes/lasers/an-in-depth-look-at-axicons/",
    telecentric: "https://www.thorlabs.com/catalogpages/Obsolete/2022/MVTC23005.pdf",
} as const;

const lensCopy = {
    ko: {
        concave: { name: "오목렌즈 · Bi-Concave", description: "양쪽 면이 안으로 굽어 빛을 퍼뜨려요. 빔의 폭을 넓히거나 광학계의 빛 경로를 조절할 때 쓰여요." },
        convex: { name: "볼록렌즈 · Plano-Convex", description: "평평한 면과 볼록한 면이 평행한 빛을 모아요. 레이저를 집속하거나 빛을 평행하게 만드는 데 쓰여요." },
        "plano-concave": { name: "평오목렌즈 · Plano-Concave", description: "한쪽은 평평하고 다른 쪽은 오목해 평행한 빛을 퍼뜨려요. 레이저 빔의 폭을 넓히는 데 쓰여요." },
        "bi-convex": { name: "양볼록렌즈 · Bi-Convex", description: "양쪽 면이 볼록해 빛을 모아요. 물체와 상까지의 거리가 비슷한 영상 광학계에 잘 맞아요." },
        meniscus: { name: "양의 메니스커스 렌즈", description: "볼록한 면과 오목한 면이 함께 있어요. 여기의 양의 렌즈는 구면수차를 줄이며 빛을 모으는 데 쓰여요." },
        achromatic: { name: "아크로매틱 렌즈 · Achromat", description: "두 렌즈를 조합해 두 파장의 초점을 맞춰요. 영상의 색 번짐을 줄여 더 선명하게 보여줘요." },
        apochromat: { name: "아포크로매틱 렌즈 · APO", description: "세 파장의 초점을 보정해 정밀한 현미경 관찰에 쓰여요. 설계에 따라 세 장 이상의 렌즈를 사용할 수 있어요." },
        axicon: { name: "액시콘 · Axicon", description: "원뿔 모양의 면으로 길고 좁은 빛이나 고리 모양의 빛을 만들어요. 레이저 가공 등에 쓰여요." },
        bessel: { name: "베셀 빔 · Bessel Beam", description: "렌즈가 아닌 빛의 패턴이에요. 실제로는 유한한 거리에서만 거의 퍼지지 않아 현미경 관찰 등에 쓰여요." },
        telecentric: { name: "텔레센트릭 광학계", description: "주광선이 광축과 평행한 광학계예요. 작동 범위 안에서 원근감과 배율 변화를 줄여 정밀 측정에 쓰여요." },
    },
    en: {
        concave: { name: "Concave · Bi-Concave", description: "Two inward-curved faces spread light. Used in beam expanders and optical systems." },
        convex: { name: "Convex · Plano-Convex", description: "One flat face and one convex face focus parallel light. Used for laser focusing and collimation." },
        "plano-concave": { name: "Plano-concave lens", description: "One flat face and one concave face spread parallel light. Used in beam expanders." },
        "bi-convex": { name: "Bi-convex lens", description: "Two convex faces bring light together. Well suited to imaging at similar object and image distances." },
        meniscus: { name: "Positive meniscus lens", description: "One convex and one concave face; this positive type focuses light with reduced spherical aberration." },
        achromatic: { name: "Achromatic doublet", description: "Two lens elements align two wavelengths at a common focus, reducing color fringes in imaging." },
        apochromat: { name: "Apochromat · APO", description: "Aligns three wavelengths for detailed microscopy. It can use three or more elements, depending on the design." },
        axicon: { name: "Axicon", description: "A conical surface forms a narrow extended beam or a ring. Used in laser machining." },
        bessel: { name: "Bessel beam", description: "A beam pattern, not a lens. Practical versions spread very little over a finite range, useful for microscopy." },
        telecentric: { name: "Telecentric optical system", description: "Parallel chief rays reduce perspective and magnification changes within this optical system’s working range for measurement." },
    },
    ja: {
        concave: { name: "凹レンズ · Bi-Concave", description: "両面が内側にくぼみ、光を広げます。ビームの幅を広げる装置や光学系で使われます。" },
        convex: { name: "凸レンズ · Plano-Convex", description: "平面と凸面で平行な光を集めます。レーザーの集光や、光を平行にする用途に使われます。" },
        "plano-concave": { name: "平凹レンズ · Plano-Concave", description: "片面が平らで、もう片面がくぼみ、平行な光を広げます。ビームの幅を広げる装置に使われます。" },
        "bi-convex": { name: "両凸レンズ · Bi-Convex", description: "両側の凸面が光を集めます。物体と像までの距離が近い値となる結像に適しています。" },
        meniscus: { name: "正のメニスカスレンズ", description: "凸面と凹面を持つレンズです。この正のタイプは、球面収差を抑えて光を集める用途に使われます。" },
        achromatic: { name: "アクロマートレンズ", description: "2枚のレンズで2つの波長の焦点を合わせます。画像の色にじみを減らすために使われます。" },
        apochromat: { name: "アポクロマート · APO", description: "3つの波長の焦点を補正し、精密な顕微鏡観察に使われます。設計により3枚以上のレンズを使うことがあります。" },
        axicon: { name: "アキシコン · Axicon", description: "円すい面で細長い光やリング状の光を作ります。レーザー加工などに使われます。" },
        bessel: { name: "ベッセルビーム", description: "レンズではなく光のパターンです。実際には有限の距離でのみほとんど広がらず、顕微鏡観察などに使われます。" },
        telecentric: { name: "テレセントリック光学系", description: "主光線が光軸と平行な光学系です。動作範囲内で遠近感や倍率の変化を抑え、精密測定に使われます。" },
    },
    zh: {
        concave: { name: "凹透镜 · Bi-Concave", description: "两面向内凹，使光线发散。常用于扩束器和光学系统。" },
        convex: { name: "凸透镜 · Plano-Convex", description: "一个平面和一个凸面使平行光会聚。用于激光聚焦和光束准直。" },
        "plano-concave": { name: "平凹透镜 · Plano-Concave", description: "一面平坦、一面内凹，使平行光发散。用于扩大光束宽度。" },
        "bi-convex": { name: "双凸透镜 · Bi-Convex", description: "两个凸面使光线会聚。适合物距与像距相近的成像系统。" },
        meniscus: { name: "正弯月透镜", description: "同时具有凸面和凹面。这里的正透镜用于会聚光线，并减小球面像差。" },
        achromatic: { name: "消色差双胶合透镜", description: "组合两个透镜，使两种波长聚焦于同一点。用于减少成像时的彩色边缘。" },
        apochromat: { name: "复消色差透镜 · APO", description: "校正三种波长的焦点，用于精密显微观察。根据设计，可以采用三片或更多透镜。" },
        axicon: { name: "轴锥镜 · Axicon", description: "圆锥面形成细长光束或环形光束。用于激光加工等领域。" },
        bessel: { name: "贝塞尔光束", description: "这是光束图案，并非透镜。实际光束仅在有限距离内近似不衍射，可用于显微观察。" },
        telecentric: { name: "远心光学系统", description: "主光线与光轴平行的光学系统。在工作范围内减小透视和倍率变化，用于精密测量。" },
    },
    vi: {
        concave: { name: "Thấu kính lõm · Bi-Concave", description: "Hai mặt lõm làm ánh sáng phân kỳ. Dùng để mở rộng chùm tia trong hệ quang học." },
        convex: { name: "Thấu kính lồi · Plano-Convex", description: "Một mặt phẳng và một mặt lồi hội tụ tia song song. Dùng để hội tụ hoặc chuẩn trực laser." },
        "plano-concave": { name: "Thấu kính phẳng lõm", description: "Một mặt phẳng và một mặt lõm làm tia song song phân kỳ. Dùng trong bộ mở rộng chùm tia." },
        "bi-convex": { name: "Thấu kính hai mặt lồi", description: "Hai mặt lồi hội tụ ánh sáng. Hợp với hệ tạo ảnh có khoảng cách vật và ảnh gần bằng nhau." },
        meniscus: { name: "Thấu kính khum dương", description: "Có một mặt lồi và một mặt lõm. Loại dương này hội tụ ánh sáng và giảm quang sai cầu." },
        achromatic: { name: "Thấu kính đôi tiêu sắc", description: "Hai thấu kính đưa hai bước sóng về cùng tiêu điểm, giúp giảm viền màu trong ảnh." },
        apochromat: { name: "Thấu kính apochromat · APO", description: "Hiệu chỉnh ba bước sóng cho kính hiển vi. Có thể dùng ba thấu kính trở lên, tùy thiết kế." },
        axicon: { name: "Thấu kính axicon", description: "Mặt hình nón tạo chùm tia hẹp kéo dài hoặc dạng vòng. Dùng trong gia công laser." },
        bessel: { name: "Chùm Bessel", description: "Là dạng chùm sáng, không phải thấu kính. Gần như không nhiễu xạ trong khoảng hữu hạn, hữu ích cho kính hiển vi." },
        telecentric: { name: "Hệ quang viễn tâm", description: "Tia chính song song với trục quang giúp giảm biến đổi phối cảnh và độ phóng đại trong phạm vi làm việc, dùng để đo lường." },
    },
    es: {
        concave: { name: "Lente cóncava · Bi-Concave", description: "Dos caras cóncavas dispersan la luz. Se usa en expansores de haz y sistemas ópticos." },
        convex: { name: "Lente convexa · Plano-Convex", description: "Una cara plana y otra convexa concentran luz paralela. Se usa para enfocar y colimar láseres." },
        "plano-concave": { name: "Lente planocóncava", description: "Una cara plana y otra cóncava dispersan luz paralela. Se usa para ampliar haces." },
        "bi-convex": { name: "Lente biconvexa", description: "Dos caras convexas concentran la luz. Adecuada para imágenes con distancias de objeto e imagen similares." },
        meniscus: { name: "Menisco positivo", description: "Tiene una cara convexa y otra cóncava. Este tipo positivo enfoca la luz reduciendo la aberración esférica." },
        achromatic: { name: "Doblete acromático", description: "Dos lentes unen el foco de dos longitudes de onda, reduciendo los bordes de color en las imágenes." },
        apochromat: { name: "Apocromático · APO", description: "Corrige tres longitudes de onda para microscopía precisa. Puede usar tres o más elementos, según el diseño." },
        axicon: { name: "Axicón", description: "Una superficie cónica forma un haz estrecho y alargado o un anillo. Se usa en mecanizado láser." },
        bessel: { name: "Haz de Bessel", description: "Es un patrón de luz, no una lente. Casi no difracta en un rango finito en la práctica; resulta útil en microscopía." },
        telecentric: { name: "Sistema óptico telecéntrico", description: "Sus rayos principales paralelos reducen los cambios de perspectiva y aumento dentro de su rango de trabajo para medición." },
    },
    fr: {
        concave: { name: "Lentille concave · Bi-Concave", description: "Deux faces concaves écartent la lumière. Utilisée dans les élargisseurs de faisceau et les systèmes optiques." },
        convex: { name: "Lentille convexe · Plano-Convex", description: "Une face plane et une face convexe concentrent la lumière parallèle. Sert à focaliser ou collimater un laser." },
        "plano-concave": { name: "Lentille plan-concave", description: "Une face plane et une face concave écartent la lumière parallèle. Sert à élargir les faisceaux." },
        "bi-convex": { name: "Lentille biconvexe", description: "Deux faces convexes concentrent la lumière. Adaptée à l’imagerie avec des distances objet et image voisines." },
        meniscus: { name: "Ménisque positif", description: "Une face convexe et une face concave. Ce type positif focalise la lumière en limitant l’aberration sphérique." },
        achromatic: { name: "Doublet achromatique", description: "Deux lentilles réunissent deux longueurs d’onde au même foyer, réduisant les franges colorées en imagerie." },
        apochromat: { name: "Apochromat · APO", description: "Corrige trois longueurs d’onde pour la microscopie précise. Peut utiliser trois éléments ou plus, selon sa conception." },
        axicon: { name: "Axicon", description: "Une surface conique forme un faisceau fin et allongé ou un anneau. Utilisé pour l’usinage laser." },
        bessel: { name: "Faisceau de Bessel", description: "Un profil lumineux, pas une lentille. En pratique, il diffracte très peu sur une portée finie, utile en microscopie." },
        telecentric: { name: "Système optique télécentrique", description: "Des rayons principaux parallèles limitent les variations de perspective et de grossissement dans sa plage de travail pour la mesure." },
    },
    de: {
        concave: { name: "Konkavlinse · Bi-Concave", description: "Zwei nach innen gewölbte Flächen zerstreuen Licht. Für Strahlaufweiter und optische Systeme." },
        convex: { name: "Konvexlinse · Plano-Convex", description: "Eine ebene und eine konvexe Fläche bündeln paralleles Licht. Zum Fokussieren und Kollimieren von Lasern." },
        "plano-concave": { name: "Plankonkavlinse", description: "Eine ebene und eine konkave Fläche zerstreuen paralleles Licht. Für Strahlaufweiter." },
        "bi-convex": { name: "Bikonvexlinse", description: "Zwei konvexe Flächen bündeln Licht. Gut für Abbildungen mit ähnlicher Gegenstands- und Bildweite." },
        meniscus: { name: "Positive Meniskuslinse", description: "Eine konvexe und eine konkave Fläche. Dieser positive Typ bündelt Licht mit geringerer sphärischer Aberration." },
        achromatic: { name: "Achromatisches Dublett", description: "Zwei Linsen vereinen zwei Wellenlängen in einem Brennpunkt und verringern Farbsäume in Bildern." },
        apochromat: { name: "Apochromat · APO", description: "Korrigiert drei Wellenlängen für präzise Mikroskopie. Je nach Aufbau sind drei oder mehr Linsenelemente möglich." },
        axicon: { name: "Axikon", description: "Eine Kegelfläche erzeugt einen langen, schmalen Strahl oder einen Ring. Für die Laserbearbeitung." },
        bessel: { name: "Bessel-Strahl", description: "Ein Lichtmuster, keine Linse. Praktisch nahezu beugungsfrei über einen begrenzten Bereich; nützlich in der Mikroskopie." },
        telecentric: { name: "Telezentrisches optisches System", description: "Parallele Hauptstrahlen verringern Perspektiv- und Maßstabsänderungen im Arbeitsbereich. Für präzise Messungen." },
    },
    ru: {
        concave: { name: "Вогнутая линза · Bi-Concave", description: "Две вогнутые поверхности рассеивают свет. Применяется в расширителях пучка и оптических системах." },
        convex: { name: "Выпуклая линза · Plano-Convex", description: "Плоская и выпуклая поверхности собирают параллельный свет. Для фокусировки и коллимации лазеров." },
        "plano-concave": { name: "Плосковогнутая линза", description: "Плоская и вогнутая поверхности рассеивают параллельный свет. Используется для расширения пучка." },
        "bi-convex": { name: "Двояковыпуклая линза", description: "Две выпуклые поверхности собирают свет. Подходит для близких по величине расстояний до предмета и изображения." },
        meniscus: { name: "Положительный мениск", description: "Имеет выпуклую и вогнутую поверхности. Этот положительный тип фокусирует свет с меньшей сферической аберрацией." },
        achromatic: { name: "Ахроматический дублет", description: "Две линзы сводят две длины волны в общий фокус, уменьшая цветные каймы на изображении." },
        apochromat: { name: "Апохромат · APO", description: "Корректирует три длины волны для точной микроскопии. Может включать три и более линз — в зависимости от конструкции." },
        axicon: { name: "Аксикон", description: "Коническая поверхность создаёт узкий протяжённый пучок или кольцо. Используется в лазерной обработке." },
        bessel: { name: "Бесселев пучок", description: "Это световой профиль, а не линза. На практике почти не дифрагирует на конечном участке; полезен в микроскопии." },
        telecentric: { name: "Телецентрическая оптическая система", description: "Параллельные главные лучи уменьшают изменения перспективы и масштаба в рабочем диапазоне. Для точных измерений." },
    },
    ar: {
        concave: { name: "عدسة مقعرة · Bi-Concave", description: "سطحان مقعران يفرّقان الضوء. تُستخدم في موسّعات الحزم والأنظمة البصرية." },
        convex: { name: "عدسة محدبة · Plano-Convex", description: "سطح مستوٍ وآخر محدب يجمعان الضوء المتوازي. لتركيز الليزر أو جعل أشعته متوازية." },
        "plano-concave": { name: "عدسة مستوية مقعرة", description: "سطح مستوٍ وآخر مقعر يفرّقان الضوء المتوازي. تُستخدم لتوسيع الحزم الضوئية." },
        "bi-convex": { name: "عدسة محدبة الوجهين", description: "سطحان محدبان يجمعان الضوء. تناسب التصوير حين تتقارب المسافتان إلى الجسم والصورة." },
        meniscus: { name: "عدسة هلالية موجبة", description: "لها سطح محدب وآخر مقعر. هذا النوع الموجب يركّز الضوء مع تقليل الزيغ الكروي." },
        achromatic: { name: "عدسة مزدوجة لا لونية", description: "تجمع عدستان طولين موجيين في بؤرة مشتركة، لتقليل الحواف الملونة في التصوير." },
        apochromat: { name: "عدسة أبوكروماتية · APO", description: "تصحّح ثلاثة أطوال موجية للتصوير المجهري الدقيق. قد تضم ثلاث عدسات أو أكثر، بحسب التصميم." },
        axicon: { name: "أكسيكون · Axicon", description: "سطح مخروطي يشكّل حزمة ضيقة ممتدة أو حلقة ضوئية. تُستخدم في المعالجة بالليزر." },
        bessel: { name: "حزمة بيسل", description: "نمط ضوئي وليس عدسة. عمليًا تكاد لا تحيد ضمن مدى محدود، ما يفيد في التصوير المجهري." },
        telecentric: { name: "نظام بصري تليسنترك", description: "أشعته الرئيسية الموازية للمحور تقلّل تغيرات المنظور والتكبير ضمن نطاق عمله. يُستخدم للقياسات الدقيقة." },
    },
} satisfies Record<LanguageCode, Record<LensId, LensCopy>>;

const explorerCopy = {
    ko: {
        activateHint: "더블클릭하면 렌즈를 둘러볼 수 있어요. Enter나 Space 키로도 열 수 있어요.",
        nextHint: "더블클릭하면 다른 렌즈가 나와요.",
        diagramNote: "개념도",
        backToPair: "두 렌즈로 돌아가기",
        pairTitle: "오목렌즈와 볼록렌즈",
    },
    en: {
        activateHint: "Double-click to explore lenses; Enter or Space also works.",
        nextHint: "Double-click for another lens.",
        diagramNote: "Conceptual diagram",
        backToPair: "Back to the pair",
        pairTitle: "Concave and convex lenses",
    },
    ja: {
        activateHint: "ダブルクリックでレンズを見てみましょう。EnterやSpaceキーでも開けます。",
        nextHint: "ダブルクリックで別のレンズを表示します。",
        diagramNote: "概念図",
        backToPair: "2つのレンズに戻る",
        pairTitle: "凹レンズと凸レンズ",
    },
    zh: {
        activateHint: "双击探索各种透镜，也可按 Enter 或 Space。",
        nextHint: "双击查看另一种透镜。",
        diagramNote: "概念示意图",
        backToPair: "返回双透镜",
        pairTitle: "凹透镜与凸透镜",
    },
    vi: {
        activateHint: "Nhấp đúp để khám phá thấu kính; cũng có thể nhấn Enter hoặc Space.",
        nextHint: "Nhấp đúp để xem thấu kính khác.",
        diagramNote: "Sơ đồ khái niệm",
        backToPair: "Trở về cặp thấu kính",
        pairTitle: "Thấu kính lõm và lồi",
    },
    es: {
        activateHint: "Haz doble clic para explorar lentes; también puedes pulsar Enter o Space.",
        nextHint: "Haz doble clic para ver otra lente.",
        diagramNote: "Diagrama conceptual",
        backToPair: "Volver al par de lentes",
        pairTitle: "Lentes cóncava y convexa",
    },
    fr: {
        activateHint: "Double-cliquez pour explorer les lentilles ; Entrée ou Espace fonctionne aussi.",
        nextHint: "Double-cliquez pour voir une autre lentille.",
        diagramNote: "Schéma de principe",
        backToPair: "Revenir aux deux lentilles",
        pairTitle: "Lentilles concave et convexe",
    },
    de: {
        activateHint: "Linsen per Doppelklick erkunden; auch mit Eingabe- oder Leertaste.",
        nextHint: "Per Doppelklick eine andere Linse ansehen.",
        diagramNote: "Prinzipskizze",
        backToPair: "Zurück zum Linsenpaar",
        pairTitle: "Konkave und konvexe Linsen",
    },
    ru: {
        activateHint: "Дважды щёлкните для знакомства с линзами; также работают Enter и пробел.",
        nextHint: "Дважды щёлкните, чтобы увидеть другую линзу.",
        diagramNote: "Принципиальная схема",
        backToPair: "Вернуться к паре линз",
        pairTitle: "Вогнутая и выпуклая линзы",
    },
    ar: {
        activateHint: "انقر مرتين لاستكشاف العدسات؛ يمكنك أيضًا الضغط على Enter أو Space.",
        nextHint: "انقر مرتين لعرض عدسة أخرى.",
        diagramNote: "رسم مفاهيمي",
        backToPair: "العودة إلى العدستين",
        pairTitle: "عدستان مقعرة ومحدبة",
    },
} satisfies Record<LanguageCode, ExplorerCopy>;

export function getLensCopy(language: LanguageCode, id: LensId): LensCopy {
    return lensCopy[language][id];
}

export function getExplorerCopy(language: LanguageCode): ExplorerCopy {
    return explorerCopy[language];
}
