import type { LanguageCode } from "./i18n";

interface GuideSection {
    title: string;
    paragraphs: readonly string[];
}

interface UserGuide {
    title: string;
    close: string;
    projectLink: string;
    sections: readonly [GuideSection, GuideSection, GuideSection, GuideSection, GuideSection];
}

const guides = {
    ko: {
        title: "ZipLens 사용 방법",
        close: "닫기",
        projectLink: "GitHub에서 ZipLens 프로젝트 보기",
        sections: [
            {
                title: "파일 열기와 미리보기",
                paragraphs: [
                    "파일이나 폴더를 창에 끌어다 놓으면 알맞은 작업으로 이동해요. 상단의 ‘열기’나 메인 화면의 ‘파일 선택’으로 파일을 고르고, ‘폴더 선택’으로 폴더를 고를 수 있어요. 압축 파일은 안의 목록을 먼저 보여줘요. 압축 파일만 여러 개 선택하면 첫 번째 파일을 열고 안내를 표시해요. 목록에서 폴더를 한 번 클릭하면 안으로 이동하고, 검색창에서 파일 이름을 찾을 수 있어요.",
                    "파일을 두 번 클릭하면 열려요. 지원하는 이미지와 텍스트 파일은 20MB 미만일 때 앱 안에서 미리 보여줘요. 그 밖의 파일은 임시로 압축을 풀어 기본 앱에서 열어요.",
                ],
            },
            {
                title: "전체 또는 선택한 파일 풀기",
                paragraphs: [
                    "‘전체 선택’을 누르거나 체크박스로 필요한 파일을 골라 주세요. ‘압축 해제’를 누르고 저장할 폴더를 선택하면 돼요. 암호가 필요한 파일은 안내가 나올 때 비밀번호를 입력해 주세요.",
                    "‘알아서 풀기’는 원본 압축 파일 옆에 저장해요. 선택한 최상위 항목이 여러 개면 압축 파일 이름의 폴더를 만들어요. 완료 후에는 결과 창에서 저장된 파일과 오류를 확인해 주세요.",
                ],
            },
            {
                title: "새 압축 파일 만들기",
                paragraphs: [
                    "일반 파일이나 폴더를 놓거나 선택하면 선택한 항목이 담긴 압축 설정이 열려요. 압축 파일과 일반 파일 또는 폴더를 함께 선택해도 모두 새 압축의 대상이 돼요. 형식과 옵션을 정하고 ‘선택한 항목 압축’을 누른 뒤 이름과 저장 위치를 지정하면 시작돼요. ‘다시 선택’으로 대상을 바꿀 수 있어요.",
                    "‘새로 압축’을 누르고 형식과 선택 대상(파일 또는 폴더)을 정해 주세요. ‘선택하고 압축’을 누른 뒤 원본을 고르고, 압축 파일의 이름과 저장 위치를 지정하면 시작돼요.",
                    "ZIP, 7Z, TAR, TAR.GZ, TAR.ZST를 만들 수 있어요. ‘빠르게’는 시간을, ‘최대 압축’은 용량 줄이기를 우선해요. 보통은 ‘균형’으로 시작하면 좋아요. 파일 종류에 따라 효과가 달라지고, TAR는 파일을 묶기만 해요.",
                    "비밀번호와 분할 압축이 필요하면 ZIP 또는 7Z를 선택해 주세요. TAR 계열은 이 두 옵션을 지원하지 않아요. ALZ·EGG는 열기와 압축 해제만 지원해요.",
                ],
            },
            {
                title: "언어·기본 앱·프로그램 정보",
                paragraphs: [
                    "상단에서 언어를 바꿀 수 있어요. ‘기본 압축 앱 설정’에서는 연결할 형식을 선택해 Finder에서 압축 파일을 두 번 클릭할 때 ZipLens로 열리게 할 수 있어요.",
                    "상단의 ⓘ 버튼에서 프로그램 정보와 Buy Me a Coffee, Ko-fi, Bitcoin 후원 방법을 볼 수 있어요. 후원은 선택 사항이에요.",
                ],
            },
            {
                title: "AI 도구와 자동화에서 사용하기",
                paragraphs: [
                    "ZipLens는 같은 앱을 명령줄(CLI)에서도 사용할 수 있어요. 터미널 실행 권한이 있는 AI 도구나 자동화 프로그램이 파일 목록 조회, 압축 해제, 압축 만들기를 호출할 수 있어요. 직접 사용할 때는 지금처럼 앱 창에서 작업하면 돼요.",
                ],
            },
        ],
    },
    en: {
        title: "How to use ZipLens",
        close: "Close",
        projectLink: "View the ZipLens project on GitHub",
        sections: [
            {
                title: "Open and preview files",
                paragraphs: [
                    "Drop files or folders onto the window to choose the appropriate action automatically. Use Open at the top or Choose files on the home screen to select files; use Choose folders for folders. An archive opens its file list first. If you select only archives and there are several, the first opens with a notice. Click a folder in the list to browse inside it, or search by filename.",
                    "Double-click a file to open it. Supported images and text files smaller than 20 MB appear in the app. Other files are extracted to a temporary location and opened in their default app.",
                ],
            },
            {
                title: "Extract all or selected files",
                paragraphs: [
                    "Choose Select All or use the checkboxes to pick the files you need. Choose Extract Archive, then select a destination folder. Enter the password when prompted for an encrypted archive.",
                    "Smart Extract saves next to the original archive. If your selection contains several top-level items, it creates a folder named after the archive. Check the results for saved files and any errors when the operation finishes.",
                ],
            },
            {
                title: "Create an archive",
                paragraphs: [
                    "Dropping or selecting regular files or folders opens compression settings with those items selected. A mix of archives and regular files or folders is also included in a new archive. Set the format and options, choose Compress selected items, then choose the archive name and save location to begin. Use Choose again to change the source.",
                    "Choose Create Archive, then set the format and source type: files or a folder. Choose Select and compress, pick your source, then choose a filename and save location to begin.",
                    "You can create ZIP, 7Z, TAR, TAR.GZ, and TAR.ZST archives. Fast prioritizes speed; Maximum aims for a smaller file and can take longer. Balanced is a good starting point. Results depend on the files, and TAR only bundles them without compression.",
                    "Choose ZIP or 7Z for passwords or split archives. TAR formats do not support those options. ALZ and EGG can be opened and extracted, but not created.",
                ],
            },
            {
                title: "Language, default app, and app information",
                paragraphs: [
                    "Change the language at the top of the window. In Default archive app, select the file types you want to open in ZipLens when you double-click them in Finder.",
                    "The ⓘ button at the top opens app information and optional support through Buy Me a Coffee, Ko-fi, or Bitcoin.",
                ],
            },
            {
                title: "Use with AI tools and automation",
                paragraphs: [
                    "The same ZipLens app also works from the command line (CLI). AI tools and automation programs with permission to run terminal commands can list, extract, and create archives. For everyday use, you can simply work in the app window.",
                ],
            },
        ],
    },
    ja: {
        title: "ZipLensの使い方",
        close: "閉じる",
        projectLink: "GitHubでZipLensプロジェクトを見る",
        sections: [
            {
                title: "ファイルを開く・プレビューする",
                paragraphs: [
                    "ファイルやフォルダーをウインドウにドロップすると、自動で適切な操作に進みます。上部の「開く」またはホーム画面の「ファイルを選択」でファイルを、「フォルダーを選択」でフォルダーを選べます。圧縮ファイルは中の一覧を表示します。圧縮ファイルだけを複数選ぶと、最初のファイルを開いて案内を表示します。一覧のフォルダーは1回クリックして移動でき、検索欄ではファイル名を探せます。",
                    "ファイルはダブルクリックで開きます。対応する画像・テキストファイルは20MB未満ならアプリ内に表示します。それ以外は一時的な場所に展開し、標準のアプリで開きます。",
                ],
            },
            {
                title: "すべて、または選択したファイルを展開する",
                paragraphs: [
                    "「すべて選択」を押すか、チェックボックスで必要なファイルを選びます。「展開」を押して保存先のフォルダーを指定してください。暗号化されている場合は、案内に従ってパスワードを入力します。",
                    "「おまかせ展開」は元の圧縮ファイルと同じ場所に保存します。選択した最上位の項目が複数ある場合は、圧縮ファイルと同じ名前のフォルダーを作ります。完了後は結果画面で保存されたファイルとエラーを確認してください。",
                ],
            },
            {
                title: "圧縮ファイルを作る",
                paragraphs: [
                    "通常のファイルやフォルダーをドロップまたは選択すると、その項目を対象に圧縮設定が開きます。圧縮ファイルと通常のファイルやフォルダーを一緒に選んだ場合も、すべて新しい圧縮ファイルに含めます。形式とオプションを設定し、「選択した項目を圧縮」を押して名前と保存先を指定すると開始します。「選び直す」で対象を変更できます。",
                    "「フォルダーを圧縮」から形式と対象（ファイルまたはフォルダー）を設定します。「選択して圧縮」を押し、元のファイルを選んでから、圧縮ファイルの名前と保存先を指定すると開始します。",
                    "ZIP、7Z、TAR、TAR.GZ、TAR.ZSTを作成できます。「高速」は時間を、「最高圧縮」はサイズの縮小を優先します。迷ったら「バランス」がおすすめです。効果はファイルによって異なり、TARは圧縮せずにファイルをまとめます。",
                    "パスワードや分割が必要な場合はZIPまたは7Zを選んでください。TAR系の形式では利用できません。ALZ・EGGは閲覧と展開のみ対応しています。",
                ],
            },
            {
                title: "言語・標準アプリ・アプリ情報",
                paragraphs: [
                    "言語はウインドウ上部で切り替えられます。「標準の圧縮アプリ」で形式を選ぶと、Finderでその形式をダブルクリックしたときにZipLensで開くよう設定できます。",
                    "上部のⓘボタンにはアプリ情報と、Buy Me a Coffee、Ko-fi、Bitcoinでの支援方法があります。支援は任意です。",
                ],
            },
            {
                title: "AIツールや自動化で使う",
                paragraphs: [
                    "同じZipLensアプリをコマンドライン（CLI）からも利用できます。ターミナルの実行権限があるAIツールや自動化プログラムから、一覧表示・展開・圧縮を呼び出せます。普段はそのままアプリのウインドウで操作できます。",
                ],
            },
        ],
    },
    zh: {
        title: "ZipLens 使用方法",
        close: "关闭",
        projectLink: "在 GitHub 上查看 ZipLens 项目",
        sections: [
            {
                title: "打开与预览文件",
                paragraphs: [
                    "将文件或文件夹拖入窗口，应用会自动进入相应操作。点击顶部的“打开”或主屏幕的“选择文件”来选择文件，点击“选择文件夹”来选择文件夹。压缩文件会先显示内部文件列表。如果只选择了多个压缩文件，则打开第一个并显示提示。单击列表中的文件夹可进入浏览，也可以按文件名搜索。",
                    "双击文件即可打开。小于 20 MB 的受支持图片和文本文件会在应用内预览，其他文件会解压到临时位置，再用默认应用打开。",
                ],
            },
            {
                title: "解压全部或选中的文件",
                paragraphs: [
                    "点击“全选”，或用复选框勾选需要的文件。点击“解压文件”后选择保存文件夹。如果压缩文件已加密，请在提示出现时输入密码。",
                    "“智能解压”会保存到原压缩文件所在的位置。如果选中了多个顶层项目，会新建一个以压缩文件命名的文件夹。完成后，请在结果窗口确认已保存的文件和错误信息。",
                ],
            },
            {
                title: "创建压缩文件",
                paragraphs: [
                    "拖入或选择普通文件或文件夹后，会打开压缩设置并保留所选项目。压缩文件与普通文件或文件夹混合选择时，也会一起打包成新的压缩文件。设置格式和选项，点击“压缩所选项目”，再指定名称和保存位置即可开始。点击“重新选择”可更换压缩对象。",
                    "点击“压缩文件夹”，设置格式和压缩对象（文件或文件夹）。点击“选择并压缩”，选取原文件，再指定压缩文件的名称和保存位置，即可开始。",
                    "可以创建 ZIP、7Z、TAR、TAR.GZ 和 TAR.ZST。“快速”优先节省时间，“最大压缩”优先减小体积，可能需要更长时间。一般可先选“均衡”。效果取决于文件类型；TAR 只打包，不压缩。",
                    "需要密码或分卷压缩时，请选择 ZIP 或 7Z。TAR 系列不支持这两项设置。ALZ 和 EGG 仅支持打开和解压，不能创建。",
                ],
            },
            {
                title: "语言、默认应用与应用信息",
                paragraphs: [
                    "可在窗口顶部切换语言。在“默认压缩应用”中选择文件类型后，即可将 Finder 中双击这些文件时使用的应用设为 ZipLens。",
                    "顶部的 ⓘ 按钮可查看应用信息，以及 Buy Me a Coffee、Ko-fi 和 Bitcoin 赞助方式。赞助完全自愿。",
                ],
            },
            {
                title: "用于 AI 工具与自动化",
                paragraphs: [
                    "同一个 ZipLens 应用也支持命令行（CLI）。有终端执行权限的 AI 工具或自动化程序可以调用文件列表、解压和创建压缩文件等功能。日常使用时，直接在应用窗口中操作即可。",
                ],
            },
        ],
    },
    vi: {
        title: "Cách sử dụng ZipLens",
        close: "Đóng",
        projectLink: "Xem dự án ZipLens trên GitHub",
        sections: [
            {
                title: "Mở và xem trước tệp",
                paragraphs: [
                    "Thả tệp hoặc thư mục vào cửa sổ để tự động chuyển đến thao tác phù hợp. Chọn Mở ở trên cùng hoặc Chọn tệp trên màn hình chính để chọn tệp; dùng Chọn thư mục để chọn thư mục. Tệp nén sẽ hiển thị danh sách nội dung trước. Nếu chỉ chọn nhiều tệp nén, ứng dụng mở tệp đầu tiên và hiển thị thông báo. Nhấp vào thư mục trong danh sách để xem nội dung hoặc tìm kiếm theo tên tệp.",
                    "Nhấp đúp vào tệp để mở. Ảnh và tệp văn bản được hỗ trợ, có kích thước dưới 20 MB, sẽ hiển thị trong ứng dụng. Các tệp khác được giải nén vào vị trí tạm rồi mở bằng ứng dụng mặc định.",
                ],
            },
            {
                title: "Giải nén tất cả hoặc các tệp đã chọn",
                paragraphs: [
                    "Chọn tất cả hoặc đánh dấu các tệp bạn cần. Nhấn Giải nén rồi chọn thư mục lưu. Nếu tệp nén được mã hóa, hãy nhập mật khẩu khi có yêu cầu.",
                    "Giải nén thông minh lưu bên cạnh tệp nén gốc. Nếu bạn chọn nhiều mục ở cấp ngoài cùng, ứng dụng sẽ tạo thư mục mang tên tệp nén. Khi hoàn tất, kiểm tra các tệp đã lưu và lỗi trong cửa sổ kết quả.",
                ],
            },
            {
                title: "Tạo tệp nén",
                paragraphs: [
                    "Thả hoặc chọn tệp thông thường hay thư mục sẽ mở cài đặt nén với các mục đó đã được chọn. Nếu chọn chung tệp nén với tệp thông thường hoặc thư mục, tất cả cũng sẽ được đưa vào một tệp nén mới. Đặt định dạng và tùy chọn, nhấn Nén các mục đã chọn, rồi chọn tên và vị trí lưu để bắt đầu. Dùng Chọn lại để đổi nguồn.",
                    "Chọn Tạo tệp nén, rồi đặt định dạng và nguồn là tệp hoặc thư mục. Nhấn Chọn và nén, chọn dữ liệu gốc, sau đó đặt tên và vị trí lưu để bắt đầu.",
                    "Bạn có thể tạo ZIP, 7Z, TAR, TAR.GZ và TAR.ZST. Nhanh ưu tiên tốc độ; Tối đa ưu tiên giảm dung lượng và có thể mất nhiều thời gian hơn. Cân bằng phù hợp để bắt đầu. Hiệu quả tùy loại tệp; TAR chỉ gom các tệp, không nén.",
                    "Chọn ZIP hoặc 7Z nếu cần mật khẩu hoặc chia tệp nén thành nhiều phần. Các định dạng TAR không hỗ trợ hai tùy chọn này. ALZ và EGG chỉ hỗ trợ mở và giải nén.",
                ],
            },
            {
                title: "Ngôn ngữ, ứng dụng mặc định và thông tin",
                paragraphs: [
                    "Đổi ngôn ngữ ở đầu cửa sổ. Trong phần Ứng dụng nén mặc định, chọn các loại tệp để mở bằng ZipLens khi nhấp đúp trong Finder.",
                    "Nút ⓘ ở đầu cửa sổ hiển thị thông tin ứng dụng và các cách ủng hộ qua Buy Me a Coffee, Ko-fi hoặc Bitcoin. Việc ủng hộ hoàn toàn tự nguyện.",
                ],
            },
            {
                title: "Dùng với công cụ AI và tự động hóa",
                paragraphs: [
                    "Bạn cũng có thể dùng chính ứng dụng ZipLens qua dòng lệnh (CLI). Công cụ AI hoặc chương trình tự động hóa có quyền chạy lệnh trong terminal có thể xem danh sách, giải nén và tạo tệp nén. Khi sử dụng thông thường, bạn chỉ cần thao tác trong cửa sổ ứng dụng.",
                ],
            },
        ],
    },
    es: {
        title: "Cómo usar ZipLens",
        close: "Cerrar",
        projectLink: "Ver el proyecto ZipLens en GitHub",
        sections: [
            {
                title: "Abrir y previsualizar archivos",
                paragraphs: [
                    "Suelta archivos o carpetas en la ventana para pasar automáticamente a la acción adecuada. Usa Abrir en la parte superior o Elegir archivos en la pantalla principal para seleccionar archivos, y Elegir carpetas para las carpetas. Un archivo comprimido muestra primero su contenido. Si solo seleccionas varios archivos comprimidos, se abre el primero y aparece un aviso. Haz clic en una carpeta de la lista para entrar en ella o busca por nombre de archivo.",
                    "Haz doble clic en un archivo para abrirlo. Las imágenes y los textos compatibles de menos de 20 MB se muestran en la aplicación. Los demás se extraen a una ubicación temporal y se abren con su aplicación predeterminada.",
                ],
            },
            {
                title: "Extraer todos los archivos o solo algunos",
                paragraphs: [
                    "Pulsa Seleccionar Todo o marca las casillas de los archivos que necesites. Pulsa Extraer Archivo y elige una carpeta de destino. Si el archivo está cifrado, introduce la contraseña cuando se solicite.",
                    "Extracción automática guarda junto al archivo comprimido original. Si seleccionas varios elementos del nivel superior, crea una carpeta con el nombre del archivo comprimido. Al terminar, consulta los archivos guardados y los errores en la ventana de resultados.",
                ],
            },
            {
                title: "Crear un archivo comprimido",
                paragraphs: [
                    "Al soltar o seleccionar archivos normales o carpetas, se abren los ajustes de compresión con esos elementos seleccionados. Una mezcla de archivos comprimidos y archivos normales o carpetas también se incluye en un nuevo archivo comprimido. Define el formato y las opciones, pulsa Comprimir elementos seleccionados y elige el nombre y la ubicación de destino para empezar. Usa Elegir de nuevo para cambiar el origen.",
                    "Pulsa Comprimir Carpeta y elige el formato y el origen: archivos o una carpeta. Pulsa Seleccionar y comprimir, elige el contenido y después indica el nombre y la ubicación de destino para comenzar.",
                    "Puedes crear ZIP, 7Z, TAR, TAR.GZ y TAR.ZST. Rápida prioriza la velocidad; Máxima busca reducir el tamaño y puede tardar más. Equilibrada es un buen punto de partida. El resultado depende de los archivos; TAR solo los agrupa, sin comprimirlos.",
                    "Para usar contraseña o dividir el archivo en partes, elige ZIP o 7Z. Los formatos TAR no admiten estas opciones. ALZ y EGG se pueden abrir y extraer, pero no crear.",
                ],
            },
            {
                title: "Idioma, aplicación predeterminada e información",
                paragraphs: [
                    "Cambia el idioma en la parte superior. En Aplicación predeterminada para archivos comprimidos, selecciona los tipos que quieras abrir con ZipLens al hacer doble clic en Finder.",
                    "El botón ⓘ de la parte superior muestra la información de la aplicación y las opciones de apoyo mediante Buy Me a Coffee, Ko-fi o Bitcoin. Las aportaciones son opcionales.",
                ],
            },
            {
                title: "Herramientas de IA y automatización",
                paragraphs: [
                    "La misma aplicación ZipLens también funciona desde la línea de comandos (CLI). Las herramientas de IA y los programas de automatización con permiso para ejecutar comandos de terminal pueden listar, extraer y crear archivos comprimidos. Para el uso habitual, basta con trabajar en la ventana de la aplicación.",
                ],
            },
        ],
    },
    fr: {
        title: "Utiliser ZipLens",
        close: "Fermer",
        projectLink: "Voir le projet ZipLens sur GitHub",
        sections: [
            {
                title: "Ouvrir et prévisualiser des fichiers",
                paragraphs: [
                    "Déposez des fichiers ou des dossiers dans la fenêtre pour accéder automatiquement à l’action adaptée. Utilisez Ouvrir en haut ou Choisir des fichiers sur l’accueil pour sélectionner des fichiers, et Choisir des dossiers pour les dossiers. Une archive affiche d’abord son contenu. Si vous sélectionnez uniquement plusieurs archives, la première s’ouvre avec un message. Cliquez sur un dossier de la liste pour le parcourir ou recherchez un fichier par son nom.",
                    "Double-cliquez sur un fichier pour l’ouvrir. Les images et textes pris en charge de moins de 20 Mo s’affichent dans l’application. Les autres fichiers sont extraits dans un emplacement temporaire, puis ouverts avec leur application par défaut.",
                ],
            },
            {
                title: "Extraire tous les fichiers ou une sélection",
                paragraphs: [
                    "Cliquez sur Tout sélectionner ou cochez les fichiers souhaités. Cliquez sur Extraire l'archive, puis choisissez le dossier de destination. Pour une archive chiffrée, saisissez le mot de passe lorsqu’il est demandé.",
                    "Extraction auto enregistre les fichiers à côté de l’archive d’origine. Si la sélection comporte plusieurs éléments à la racine, elle crée un dossier portant le nom de l’archive. À la fin, consultez les fichiers enregistrés et les éventuelles erreurs dans la fenêtre de résultats.",
                ],
            },
            {
                title: "Créer une archive",
                paragraphs: [
                    "Déposer ou sélectionner des fichiers ordinaires ou des dossiers ouvre les réglages de compression avec ces éléments sélectionnés. Un mélange d’archives et de fichiers ordinaires ou de dossiers est également inclus dans une nouvelle archive. Réglez le format et les options, cliquez sur Compresser la sélection, puis choisissez le nom et l’emplacement de l’archive pour démarrer. Choisir à nouveau permet de changer la source.",
                    "Cliquez sur Compresser le dossier et choisissez le format ainsi que la source : fichiers ou dossier. Cliquez sur Sélectionner et compresser, choisissez le contenu, puis indiquez le nom et l’emplacement de l’archive pour démarrer.",
                    "Vous pouvez créer des archives ZIP, 7Z, TAR, TAR.GZ et TAR.ZST. Rapide privilégie la vitesse ; Maximal vise une taille plus petite et peut prendre plus de temps. Équilibré est un bon choix pour commencer. Le résultat dépend des fichiers ; TAR les regroupe sans les compresser.",
                    "Pour ajouter un mot de passe ou diviser l’archive en plusieurs parties, choisissez ZIP ou 7Z. Les formats TAR ne proposent pas ces options. ALZ et EGG peuvent être ouverts et extraits, mais pas créés.",
                ],
            },
            {
                title: "Langue, application par défaut et informations",
                paragraphs: [
                    "Changez de langue en haut de la fenêtre. Dans Application d’archives par défaut, sélectionnez les types de fichiers à ouvrir avec ZipLens lorsque vous double-cliquez dessus dans le Finder.",
                    "Le bouton ⓘ en haut affiche les informations sur l’application et les possibilités de soutien via Buy Me a Coffee, Ko-fi ou Bitcoin. Le soutien est facultatif.",
                ],
            },
            {
                title: "Outils d’IA et automatisation",
                paragraphs: [
                    "La même application ZipLens fonctionne aussi en ligne de commande (CLI). Les outils d’IA et les programmes d’automatisation autorisés à exécuter des commandes dans le terminal peuvent lister, extraire et créer des archives. Au quotidien, vous pouvez simplement utiliser la fenêtre de l’application.",
                ],
            },
        ],
    },
    de: {
        title: "ZipLens verwenden",
        close: "Schließen",
        projectLink: "ZipLens-Projekt auf GitHub ansehen",
        sections: [
            {
                title: "Dateien öffnen und ansehen",
                paragraphs: [
                    "Ziehen Sie Dateien oder Ordner in das Fenster, um automatisch zur passenden Aktion zu gelangen. Mit Öffnen oben oder Dateien auswählen auf der Startseite wählen Sie Dateien aus; mit Ordner auswählen wählen Sie Ordner. Bei einem Archiv erscheint zuerst die Dateiliste. Wenn Sie ausschließlich mehrere Archive auswählen, wird das erste mit einem Hinweis geöffnet. Klicken Sie in der Liste auf einen Ordner, um ihn zu öffnen, oder suchen Sie nach Dateinamen.",
                    "Ein Doppelklick öffnet eine Datei. Unterstützte Bild- und Textdateien unter 20 MB werden direkt in der App angezeigt. Andere Dateien werden vorübergehend entpackt und mit ihrer Standard-App geöffnet.",
                ],
            },
            {
                title: "Alle oder ausgewählte Dateien entpacken",
                paragraphs: [
                    "Wählen Sie Alle auswählen oder markieren Sie die benötigten Dateien. Klicken Sie auf Archiv entpacken und wählen Sie einen Zielordner. Bei einem verschlüsselten Archiv geben Sie das Passwort ein, sobald Sie dazu aufgefordert werden.",
                    "Automatisch entpacken speichert neben dem ursprünglichen Archiv. Enthält Ihre Auswahl mehrere Elemente auf der obersten Ebene, wird ein Ordner mit dem Namen des Archivs erstellt. Prüfen Sie anschließend im Ergebnisfenster die gespeicherten Dateien und mögliche Fehler.",
                ],
            },
            {
                title: "Ein Archiv erstellen",
                paragraphs: [
                    "Wenn Sie normale Dateien oder Ordner ablegen oder auswählen, öffnen sich die Komprimierungseinstellungen mit diesen Elementen. Eine Mischung aus Archiven und normalen Dateien oder Ordnern wird ebenfalls in ein neues Archiv aufgenommen. Legen Sie Format und Optionen fest, klicken Sie auf Ausgewählte Elemente komprimieren und wählen Sie anschließend Namen und Speicherort. Mit Erneut auswählen ändern Sie die Quelle.",
                    "Wählen Sie Archiv erstellen und legen Sie das Format sowie die Quelle fest: Dateien oder einen Ordner. Klicken Sie auf Auswählen und komprimieren, wählen Sie den Inhalt und geben Sie anschließend Dateiname und Speicherort an.",
                    "Sie können ZIP, 7Z, TAR, TAR.GZ und TAR.ZST erstellen. Schnell bevorzugt kurze Laufzeiten; Maximal zielt auf kleinere Dateien und kann länger dauern. Ausgewogen eignet sich für den Einstieg. Das Ergebnis hängt von den Dateien ab; TAR fasst sie ohne Komprimierung zusammen.",
                    "Für ein Passwort oder mehrteilige Archive wählen Sie ZIP oder 7Z. TAR-Formate unterstützen diese Optionen nicht. ALZ und EGG lassen sich öffnen und entpacken, aber nicht erstellen.",
                ],
            },
            {
                title: "Sprache, Standard-App und Informationen",
                paragraphs: [
                    "Die Sprache ändern Sie oben im Fenster. Unter Standard-App für Archive wählen Sie die Dateitypen, die bei einem Doppelklick im Finder mit ZipLens geöffnet werden sollen.",
                    "Die Schaltfläche ⓘ oben zeigt Informationen zur App und Möglichkeiten zur freiwilligen Unterstützung über Buy Me a Coffee, Ko-fi oder Bitcoin.",
                ],
            },
            {
                title: "KI-Werkzeuge und Automatisierung",
                paragraphs: [
                    "Dieselbe ZipLens-App lässt sich auch über die Befehlszeile (CLI) verwenden. KI-Werkzeuge und Automatisierungsprogramme mit Berechtigung zum Ausführen von Terminalbefehlen können Archive auflisten, entpacken und erstellen. Für den normalen Gebrauch genügt das App-Fenster.",
                ],
            },
        ],
    },
    ru: {
        title: "Как пользоваться ZipLens",
        close: "Закрыть",
        projectLink: "Открыть проект ZipLens на GitHub",
        sections: [
            {
                title: "Открытие и предпросмотр файлов",
                paragraphs: [
                    "Перетащите файлы или папки в окно, чтобы автоматически перейти к нужному действию. Для файлов нажмите «Открыть» вверху или «Выбрать файлы» на главном экране; для папок — «Выбрать папки». Архив сначала показывает список содержимого. Если выбрано несколько архивов и только архивы, открывается первый и появляется уведомление. Щёлкните папку в списке, чтобы перейти в неё, или найдите файл по имени.",
                    "Двойной щелчок открывает файл. Поддерживаемые изображения и текстовые файлы размером менее 20 МБ отображаются в приложении. Остальные извлекаются во временную папку и открываются в приложении по умолчанию.",
                ],
            },
            {
                title: "Распаковка всех или выбранных файлов",
                paragraphs: [
                    "Нажмите «Выбрать всё» или отметьте нужные файлы флажками. Нажмите «Распаковать архив» и выберите папку назначения. Для зашифрованного архива введите пароль, когда появится запрос.",
                    "Умная распаковка сохраняет файлы рядом с исходным архивом. Если выбрано несколько элементов верхнего уровня, создаётся папка с именем архива. После завершения проверьте сохранённые файлы и ошибки в окне результатов.",
                ],
            },
            {
                title: "Создание архива",
                paragraphs: [
                    "При перетаскивании или выборе обычных файлов или папок открываются настройки сжатия с этими элементами. Если выбрать архивы вместе с обычными файлами или папками, все они также войдут в новый архив. Задайте формат и параметры, нажмите «Сжать выбранные элементы», затем выберите имя и место сохранения. Кнопка «Выбрать заново» позволяет изменить источник.",
                    "Нажмите «Создать архив» и выберите формат и источник: файлы или папку. Нажмите «Выбрать и сжать», укажите исходные данные, затем имя архива и место сохранения.",
                    "Можно создавать ZIP, 7Z, TAR, TAR.GZ и TAR.ZST. Режим «Быстро» экономит время, а «Максимальный» стремится уменьшить размер и может работать дольше. Для начала подойдёт «Сбалансированный». Результат зависит от файлов; TAR только объединяет их без сжатия.",
                    "Для пароля или разделения архива на части выберите ZIP или 7Z. Форматы TAR не поддерживают эти параметры. ALZ и EGG можно открывать и распаковывать, но нельзя создавать.",
                ],
            },
            {
                title: "Язык, приложение по умолчанию и информация",
                paragraphs: [
                    "Язык можно изменить в верхней части окна. В настройках приложения для архивов по умолчанию выберите типы файлов, которые должны открываться в ZipLens при двойном щелчке в Finder.",
                    "Кнопка ⓘ вверху открывает информацию о приложении и способы добровольной поддержки через Buy Me a Coffee, Ko-fi или Bitcoin.",
                ],
            },
            {
                title: "Инструменты ИИ и автоматизация",
                paragraphs: [
                    "Это же приложение ZipLens работает и из командной строки (CLI). Инструменты ИИ и программы автоматизации с разрешением на выполнение команд терминала могут просматривать содержимое, распаковывать и создавать архивы. Для обычной работы достаточно окна приложения.",
                ],
            },
        ],
    },
    ar: {
        title: "كيفية استخدام ZipLens",
        close: "إغلاق",
        projectLink: "عرض مشروع ZipLens على GitHub",
        sections: [
            {
                title: "فتح الملفات ومعاينتها",
                paragraphs: [
                    "أفلت الملفات أو المجلدات في النافذة للانتقال تلقائيًا إلى الإجراء المناسب. استخدم «فتح» في الأعلى أو «اختيار ملفات» في الشاشة الرئيسية للملفات، و«اختيار مجلدات» للمجلدات. يعرض الأرشيف قائمة محتوياته أولًا. إذا اخترت عدة أرشيفات فقط، يُفتح الأول وتظهر رسالة توضيحية. انقر على مجلد في القائمة لتصفّحه أو ابحث باسم الملف.",
                    "انقر مرتين على ملف لفتحه. تظهر الصور والملفات النصية المدعومة التي يقل حجمها عن 20 ميغابايت داخل التطبيق. أما الملفات الأخرى فتُفك في موقع مؤقت ثم تُفتح بالتطبيق الافتراضي لها.",
                ],
            },
            {
                title: "استخراج كل الملفات أو الملفات المحددة",
                paragraphs: [
                    "اضغط على «تحديد الكل» أو حدّد الملفات المطلوبة باستخدام مربعات الاختيار. اضغط على «استخراج الأرشيف» ثم اختر مجلد الحفظ. إذا كان الأرشيف مشفّرًا، فأدخل كلمة المرور عند طلبها.",
                    "يحفظ خيار «استخراج تلقائي» الملفات بجوار الأرشيف الأصلي. إذا حدّدت عدة عناصر في المستوى الأعلى، يُنشئ مجلدًا باسم الأرشيف. بعد الانتهاء، راجع الملفات المحفوظة وأي أخطاء في نافذة النتائج.",
                ],
            },
            {
                title: "إنشاء ملف مضغوط",
                paragraphs: [
                    "عند إفلات ملفات عادية أو مجلدات أو اختيارها، تُفتح إعدادات الضغط مع تحديد تلك العناصر. وإذا جمعت أرشيفات مع ملفات عادية أو مجلدات، تُضم جميعها أيضًا إلى أرشيف جديد. حدّد الصيغة والخيارات، واضغط على «ضغط العناصر المحددة»، ثم اختر اسم الأرشيف وموقع الحفظ للبدء. استخدم «اختيار من جديد» لتغيير المصدر.",
                    "اضغط على «ضغط مجلد» واختر الصيغة ونوع المصدر: ملفات أو مجلد. اضغط على «تحديد وضغط»، واختر المحتوى الأصلي، ثم حدّد اسم الأرشيف وموقع حفظه للبدء.",
                    "يمكنك إنشاء أرشيفات ZIP و7Z وTAR وTAR.GZ وTAR.ZST. يعطي «سريع» الأولوية للوقت، بينما يهدف «أقصى ضغط» إلى تقليل الحجم وقد يستغرق وقتًا أطول. يُعد «متوازن» خيارًا مناسبًا للبدء. تختلف النتيجة بحسب الملفات، وصيغة TAR تجمعها فقط دون ضغط.",
                    "اختر ZIP أو 7Z لإضافة كلمة مرور أو تقسيم الأرشيف إلى أجزاء. صيغ TAR لا تدعم هذين الخيارين. يمكن فتح ملفات ALZ وEGG واستخراجها، لكن لا يمكن إنشاؤها.",
                ],
            },
            {
                title: "اللغة والتطبيق الافتراضي ومعلومات التطبيق",
                paragraphs: [
                    "يمكنك تغيير اللغة من أعلى النافذة. في إعدادات تطبيق الأرشيف الافتراضي، اختر أنواع الملفات التي تريد فتحها باستخدام ZipLens عند النقر عليها مرتين في Finder.",
                    "يعرض زر ⓘ في الأعلى معلومات التطبيق وطرق الدعم عبر Buy Me a Coffee أو Ko-fi أو Bitcoin. الدعم اختياري.",
                ],
            },
            {
                title: "أدوات الذكاء الاصطناعي والأتمتة",
                paragraphs: [
                    "يمكن استخدام تطبيق ZipLens نفسه عبر سطر الأوامر (CLI). تستطيع أدوات الذكاء الاصطناعي وبرامج الأتمتة المصرّح لها بتنفيذ أوامر الطرفية عرض محتويات الأرشيفات واستخراجها وإنشاء أرشيفات جديدة. وللاستخدام اليومي، يكفي العمل من نافذة التطبيق.",
                ],
            },
        ],
    },
} satisfies Record<LanguageCode, UserGuide>;

export function updateUserGuide(lang: LanguageCode): void {
    const dialog = document.getElementById("user-guide-dialog");
    const title = document.getElementById("user-guide-title");
    const content = document.getElementById("user-guide-content");
    const close = document.getElementById("user-guide-close");
    if (!dialog || !title || !content || !close) return;

    const copy = guides[lang];
    dialog.lang = lang === "zh" ? "zh-Hans" : lang;
    dialog.dir = lang === "ar" ? "rtl" : "ltr";
    title.textContent = copy.title;
    close.textContent = copy.close;

    const sections = copy.sections.map((sectionCopy) => {
        const section = document.createElement("section");
        const heading = document.createElement("h3");
        heading.textContent = sectionCopy.title;
        section.append(heading);
        for (const text of sectionCopy.paragraphs) {
            const paragraph = document.createElement("p");
            paragraph.textContent = text;
            section.append(paragraph);
        }
        return section;
    });

    const linkParagraph = document.createElement("p");
    const projectLink = document.createElement("a");
    projectLink.id = "user-guide-project-link";
    projectLink.href = "https://github.com/SeederPowerDrop/ZipLens";
    projectLink.target = "_blank";
    projectLink.rel = "noopener noreferrer";
    projectLink.textContent = copy.projectLink;
    linkParagraph.append(projectLink);
    sections[sections.length - 1].append(linkParagraph);
    content.replaceChildren(...sections);
}
