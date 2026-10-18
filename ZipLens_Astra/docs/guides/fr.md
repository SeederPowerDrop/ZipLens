# ZipLens 2.1.3 — Présentation et guide d’utilisation

[Langues](README.md) · [Télécharger le DMG](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.3/ZipLens_2.1.3_arm64-preview.dmg) · [Version, sources et sommes de contrôle](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.3)

<img src="../screenshots/2.1.3/compression-fr.png" alt="Application réelle : options de compression en français" width="640">

**Consultez le contenu avant l’extraction et choisissez seulement les fichiers utiles.** ZipLens est une application macOS gratuite et sans publicité, créée par SeederPowerDrop. Des lentilles illustrent la compression et l’extraction.

## Fonctions

- Parcourir les dossiers, rechercher des noms, sélectionner des fichiers et prévisualiser les petites images compatibles et le texte UTF-8.
- Créer des archives **ZIP, 7Z, TAR, TAR.GZ et TAR.ZST**. L’interface propose mot de passe et découpage pour ZIP/7Z. ALZ/EGG servent uniquement à l’extraction.
- Gérer les conflits de noms, annuler une tâche et consulter les chemins de sortie réels et les erreurs.
- Dix langues d’interface, guides GitHub et automatisation par la [CLI JSON](../AI_CLI.md) de la même application, sans clé d’API d’IA supplémentaire.

## Installation avec le DMG

1. Terminez les tâches, quittez les anciennes versions avec **⌘Q**, puis ouvrez le DMG.
2. Copiez **ZipLens.app en entier dans Applications**. Sauvegardez l’ancienne installation avant de la remplacer.
3. Lancez la copie installée, vérifiez **2.1.3** dans **ⓘ**, puis éjectez le volume DMG.

Il s’agit d’une **préversion Apple Silicon signée ad-hoc, sans notarisation Apple**. Un DMG ne remplace pas la notarisation : macOS peut bloquer le lancement. Le fonctionnement sur tous les autres Mac n’est pas garanti et l’exécution sur Intel n’a pas été vérifiée. Pour autoriser manuellement une application dont vous jugez la provenance fiable, suivez les [instructions officielles d’Apple](https://support.apple.com/102445). [Vérifications du DMG, du téléchargement et de l’installation](../INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

## Utilisation courante

1. **Extraire :** Déposez ou ouvrez une archive, parcourez et sélectionnez les éléments, puis choisissez l’extraction et le dossier de destination. Saisissez le mot de passe si nécessaire.
2. **Compresser :** Déposez ou sélectionnez des fichiers/dossiers, choisissez format, options, nom et destination. Commencez par le réglage équilibré ; photos et vidéos déjà compressées peuvent peu diminuer.
3. **Vérifier :** Consultez les chemins réels et les erreurs. Une annulation ou un échec peut laisser les fichiers déjà terminés. Réunissez toutes les parties d’une archive découpée et ouvrez la première.

Changez de langue en haut de la fenêtre. **ⓘ → Guide d’utilisation / Aide** ouvre le guide de la langue choisie sur GitHub `main` et nécessite internet. Si le navigateur ne peut pas être lancé, le guide de base intégré s’affiche. Une erreur réseau après l’ouverture du navigateur ne déclenche pas automatiquement ce repli. **ⓘ** contient aussi les licences, le soutien facultatif et l’adresse/QR Bitcoin.

## Mesures antérieures : moteur 2.1.2

Ces résultats proviennent de la **CLI 2.1.2, le 18 octobre 2026** ; ils ne constituent pas une nouvelle mesure de 2.1.3. Machine : Apple M3, 24 GiB, macOS 15.7.5 ; niveau de compression 6.

| Données | Résultat observé |
|---|---|
| Un fichier de 4 GiB + 64 MiB, environ 4,36 Go | ZIP 2.1.2 : médianes de 64,9 s en compression et 8,5 s en extraction ; deux répétitions par opération |
| 10 000 fichiers de 4 KiB ; six répétitions supplémentaires par version | Médiane d’extraction : **0,722 s avec 2.1.1 → 0,815 s avec 2.1.2** |
| Échantillon mixte de 512 MiB, compression 7Z | Maximum RSS de l’arbre de processus échantillonné toutes les 100 ms : environ **1,71 GiB** |

Les **40 cycles complets réunissent 14 cycles de 2.1.1 et 26 de 2.1.2**. Noms, tailles et SHA-256 concordaient, et les originaux étaient conservés. La médiane d’extraction des petits fichiers était supérieure de 12,8 % ; les plages se chevauchent et la cause reste indéterminée. Nous ne revendiquons pas un gain universel. Le RSS échantillonné peut manquer de brefs pics ou compter deux fois des pages partagées. [Résultats et limites](../LARGE_FILE_VALIDATION_2026-10-18.md)

## Limites

Les mots de passe de création ZIP doivent utiliser l’ASCII imprimable ; choisissez 7Z pour Unicode. La langue de l’interface ne détermine pas l’encodage des noms. UTF-8 et les métadonnées Unicode valides sont pris en charge ; les anciens ZIP sans indication utilisent un repli compatible CP949, qui ne restitue pas toujours CP932, GBK ou CP437. Demandez un ZIP UTF-8 ou un 7Z si nécessaire. L’aperçu texte utilise UTF-8 ; l’extraction ne change pas l’encodage du contenu. Les dialogues système suivent macOS. Toutes les variantes et tous les Mac n’ont pas été testés. [Formats](../../README.md#지원-범위)

## Droits fondamentaux liés au logiciel et soutien facultatif

Chacun, quels que soient ses revenus ou sa langue, devrait pouvoir utiliser les outils numériques essentiels et étudier, modifier, partager leur code et y contribuer. Ces **droits fondamentaux liés au logiciel** guident le projet : des personnes et des IA partageant les connaissances, apprenant et créant ensemble.

Le code propre à ZipLens est sous [GPL-3.0-only](../../LICENSE) ; les licences tierces sont conservées. Le soutien officiel par [Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower) et Bitcoin est facultatif. Merci de conserver les liens vers le projet original et le soutien à l’auteur dans les versions modifiées : c’est une **demande volontaire, pas une condition supplémentaire de la GPL**.
