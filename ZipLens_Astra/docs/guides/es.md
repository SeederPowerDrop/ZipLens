# ZipLens: presentación, funciones y guía de uso

[Todos los idiomas](README.md) · Actualizado el 18 de octubre de 2026

ZipLens es una aplicación gratuita y sin anuncios para archivos comprimidos en macOS, creada por SeederPowerDrop. Permite revisar el contenido y extraer solo lo necesario. Sus lentes simbolizan compresión y extracción.

## Instalación y versión

Descarga `ZipLens_2.1.1_arm64-preview.zip` de la [versión 2.1.1](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.1). Cierra versiones anteriores con ⌘Q, extrae con Utilidad de Compresión y conserva `ZipLens.app` completo en Aplicaciones. Respalda la instalación anterior. Comprueba la versión en **ⓘ**.

Esta versión preliminar Apple Silicon tiene firma ad-hoc, sin Apple Developer ID ni notarización; macOS puede bloquearla. No se ha verificado en Intel. La descarga sigue siendo **2.1.1**; `main` puede contener cambios **Unreleased (sin publicar)**. Actualizar fuentes no actualiza la aplicación instalada.

## Funciones

- Crea **ZIP, 7Z, TAR, TAR.GZ y TAR.ZST**. ZIP/7Z admiten contraseña y división desde la interfaz. ZIP usa AES-256 por defecto; 7Z con contraseña también cifra los nombres. TAR solo agrupa; sus variantes no ofrecen contraseña ni división. Para crear ZIP, usa contraseñas con ASCII imprimible; elige 7Z para tildes u otros caracteres Unicode.
- Explora carpetas, busca, selecciona, cancela y consulta resultados. Las imágenes y textos compatibles menores de **20 MiB** se previsualizan dentro; otros archivos se extraen temporalmente y abren con su aplicación predeterminada. La vista previa de texto solo interpreta UTF-8; si el contenido con una codificación antigua se ve mal, extráelo y ábrelo con un editor compatible: es un problema de visualización, independiente de la conservación de los bytes originales al extraer.
- Extrae otros formatos, incluidos ALZ y EGG. No se garantizan todas las variantes: consulta los [límites](../../README.md#지원-범위).
- Automatiza con la [CLI JSON](../AI_CLI.md) de la misma aplicación. La CLI no incluye creación dividida.

## Abrir y extraer

1. Arrastra un archivo comprimido a la ventana o usa **Abrir**. Si eliges únicamente varios archivos comprimidos, se abre el primero con un aviso.
2. Explora, busca y marca todos los elementos o solo algunos. Haz doble clic para previsualizar o abrir un archivo.
3. Elige extraer, indica el destino e introduce la contraseña cuando se solicite. La extracción automática guarda junto al original y crea una carpeta con su nombre si seleccionas varios elementos del nivel superior.
4. Decide cómo resolver nombres repetidos y revisa las rutas reales y los errores. Una cancelación o fallo puede dejar archivos ya completados. Conserva juntas todas las partes de un archivo dividido y abre la primera.

## Crear un archivo

Arrastra o selecciona archivos/carpetas, ajusta formato y opciones, comprime la selección y elige nombre y destino. Mezclar archivos comprimidos y normales también crea un archivo nuevo. También puedes usar el botón de creación. Empieza con el nivel equilibrado: el rápido prioriza tiempo y el máximo puede tardar más. Fotos y vídeos ya comprimidos pueden reducirse poco.

## Idioma e información

Cambia el idioma arriba; el árabe se muestra de derecha a izquierda. Los diálogos de macOS siguen el sistema y algunos errores conservan otro idioma. La configuración de aplicación predeterminada cambia cómo abre Finder los archivos, no su comando Comprimir.

**ⓘ** reúne autor, versión, guía sin conexión y apoyo opcional. El botón de licencias abre su carpeta en Finder. Allí también puedes copiar la dirección Bitcoin o ver su QR.

## Nombres y rendimiento

El idioma no determina la codificación de los nombres. Se admite UTF-8 y metadatos válidos de rutas Unicode ZIP. Los ZIP antiguos sin indicación usan una interpretación compatible con CP949 coreano. No siempre se pueden identificar Shift-JIS/CP932, GBK o CP437 sin marcar. Si hace falta, pide al creador un ZIP UTF-8 o 7Z. Cambiar el idioma no repara nombres; extraer no traduce ni cambia la codificación del contenido.

La velocidad depende del formato, cantidad de archivos, nivel y almacenamiento. El [registro de validación](../VALIDATION.md) detalla condiciones y límites; no garantiza ausencia de errores en cualquier archivo.

## Libertad, contribuciones y apoyo

Los **derechos básicos sobre el software** son nuestro valor de desarrollo: cualquier persona, independientemente de ingresos o idioma, debería usar herramientas digitales básicas y estudiar, modificar, compartir y aportar a su código. Personas e IA pueden compartir conocimiento, aprender y crear juntas.

El código propio usa [GPL-3.0-only](../../LICENSE); otros componentes conservan sus licencias. Las contribuciones son bienvenidas. [Buy Me a Coffee](https://buymeacoffee.com/master_chief) y [Ko-fi](https://ko-fi.com/seederpower) son opcionales. Agradecemos conservar los enlaces al proyecto original y al apoyo al autor en versiones modificadas; es voluntario, no una condición adicional de GPL.
