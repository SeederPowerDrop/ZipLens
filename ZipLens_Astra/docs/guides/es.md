# ZipLens 2.1.3 — Presentación y guía de uso

[Idiomas](README.md) · [Descargar DMG](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.3/ZipLens_2.1.3_arm64-preview.dmg) · [Versión, código fuente y sumas de comprobación](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.3)

<img src="../screenshots/2.1.3/home-ko.png" alt="Aplicación real: inicio en coreano" width="640">

**Mira el contenido antes de extraer y elige solo lo que necesitas.** ZipLens es una aplicación gratuita y sin anuncios para macOS, creada por SeederPowerDrop. Las lentes representan la compresión y la extracción.

## Funciones

- Explora carpetas, busca nombres, selecciona archivos y previsualiza imágenes pequeñas compatibles y texto UTF-8.
- Crea **ZIP, 7Z, TAR, TAR.GZ y TAR.ZST**. La interfaz ofrece contraseña y división en partes para ZIP/7Z. ALZ/EGG solo permiten extracción.
- Gestiona nombres coincidentes, cancela tareas y revisa las rutas de salida y los errores.
- Diez idiomas de interfaz, guías en GitHub y automatización mediante la [CLI JSON](../AI_CLI.md) de la misma aplicación, sin una clave de API de IA adicional.

## Instalar desde el DMG

1. Termina las tareas, cierra versiones anteriores con **⌘Q** y abre el DMG.
2. Copia **ZipLens.app completo a Aplicaciones**. Haz una copia de seguridad de la instalación anterior antes de reemplazarla.
3. Abre la copia instalada, comprueba **2.1.3** en **ⓘ** y expulsa el volumen DMG.

Es una **versión preliminar para Apple Silicon con firma ad-hoc y sin notarización de Apple**. Un DMG no sustituye la notarización; macOS puede bloquear el inicio. No se garantiza el funcionamiento en todos los demás Mac y no se ha verificado en Intel. Si confías en el origen de la aplicación, consulta el procedimiento de autorización manual en la [guía oficial de Apple](https://support.apple.com/102445). [Comprobaciones reales de DMG, descarga e instalación](../INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

## Uso diario

1. **Extraer:** Arrastra o abre un archivo comprimido, explora y marca los elementos, y elige la extracción y la carpeta de destino. Introduce la contraseña si se solicita.
2. **Comprimir:** Arrastra o selecciona archivos/carpetas, elige el formato, las opciones, el nombre y el destino. Empieza con el ajuste equilibrado; fotos y vídeos ya comprimidos pueden reducirse muy poco.
3. **Revisar:** Comprueba las rutas reales y los errores. Una cancelación o un fallo pueden dejar archivos ya terminados. Mantén juntas todas las partes de un archivo dividido y abre la primera.

Cambia el idioma en la parte superior. **ⓘ → Guía de uso / Ayuda** abre la guía del idioma elegido en GitHub `main` y necesita internet. Si no se puede iniciar el navegador, aparece la guía básica incluida. Un error de red después de abrir el navegador no activa esa alternativa automáticamente. **ⓘ** también contiene licencias, apoyo opcional y la dirección/QR de Bitcoin.

## Mediciones anteriores: motor 2.1.2

Son resultados de la **CLI de 2.1.2 del 18 de octubre de 2026**, no nuevas pruebas de 2.1.3. Equipo: Apple M3, 24 GiB, macOS 15.7.5; nivel de compresión 6.

| Datos | Resultado observado |
|---|---|
| Un archivo de 4 GiB + 64 MiB, unos 4,36 GB | ZIP 2.1.2: medianas de 64,9 s al comprimir y 8,5 s al extraer; dos repeticiones por operación |
| 10.000 archivos de 4 KiB; seis repeticiones adicionales por versión | Mediana de extracción: **0,722 s en 2.1.1 → 0,815 s en 2.1.2** |
| Muestra mixta de 512 MiB, compresión 7Z | Máximo observado del RSS del árbol de procesos, muestreado cada 100 ms: unos **1,71 GiB** |

Las **40 pruebas completas incluyen 14 de 2.1.1 y 26 de 2.1.2**. Coincidieron nombres, tamaños y SHA-256, y los originales se conservaron. La mediana de extracción de archivos pequeños fue un 12,8 % mayor; los intervalos se solapan y la causa no está determinada. No afirmamos una mejora universal. El muestreo RSS puede omitir picos breves o contar dos veces páginas compartidas. [Resultados y límites](../LARGE_FILE_VALIDATION_2026-10-18.md)

## Límites

Para crear ZIP con contraseña usa ASCII imprimible; elige 7Z para contraseñas Unicode. El idioma de la interfaz no determina la codificación de los nombres. Se admiten UTF-8 y metadatos Unicode válidos; los ZIP antiguos sin indicación usan una interpretación compatible con CP949 y no siempre se recuperan nombres CP932, GBK o CP437. Si hace falta, solicita un ZIP UTF-8 o 7Z. La vista previa de texto usa UTF-8; extraer no cambia la codificación del contenido. Los diálogos del sistema siguen macOS. No se han probado todas las variantes ni todos los Mac. [Formatos](../../README.md#지원-범위)

## Derechos básicos sobre el software y apoyo opcional

Queremos que cualquiera, sin importar ingresos o idioma, pueda usar herramientas digitales básicas y estudiar, modificar, compartir y contribuir a su código. Estos **derechos básicos sobre el software** orientan el proyecto: personas e IA compartiendo conocimientos, aprendiendo y creando juntas.

El código propio utiliza [GPL-3.0-only](../../LICENSE); las licencias de terceros se mantienen. El apoyo oficial mediante [Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower) y Bitcoin es opcional. Pedimos conservar los enlaces al proyecto original y al apoyo al autor en versiones modificadas; es una **petición voluntaria, no una condición adicional de la GPL**.
