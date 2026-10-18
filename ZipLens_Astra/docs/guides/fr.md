# ZipLens : présentation, fonctions et guide d’utilisation

[Toutes les langues](README.md) · Mise à jour : 18 octobre 2026

ZipLens, de SeederPowerDrop, est une application macOS gratuite, sans publicité. Examinez une archive et extrayez les fichiers nécessaires. Les lentilles symbolisent compression et extraction.

## Installation et version

Téléchargez `ZipLens_2.1.1_arm64-preview.zip` depuis la [version 2.1.1](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.1). Quittez l’ancienne version avec ⌘Q, décompressez avec Utilitaire d’archive et placez `ZipLens.app` dans Applications. Sauvegardez l’ancienne installation. Vérifiez la version dans **ⓘ**.

Cette préversion Apple Silicon est signée ad-hoc, sans Apple Developer ID ni notarisation ; macOS peut la bloquer. L’exécution sur Intel n’est pas vérifiée. Le téléchargement reste **2.1.1** ; `main` peut contenir des modifications **Unreleased (non publiées)**. Les sources ne mettent pas à jour l’application installée.

## Fonctions

- Créez des **ZIP, 7Z, TAR, TAR.GZ et TAR.ZST**. ZIP/7Z proposent mot de passe et découpage dans l’interface. ZIP utilise AES-256 par défaut ; 7Z avec mot de passe chiffre aussi les noms. TAR regroupe seulement ; ses variantes n’offrent ni mot de passe ni découpage. Pour créer un ZIP, utilisez un mot de passe ASCII imprimable ; choisissez 7Z pour les accents ou autres caractères Unicode.
- Parcourez, recherchez, sélectionnez, annulez et consultez les résultats. Les images/textes compatibles de moins de **20 MiB** s’affichent dans l’application ; les autres sont extraits temporairement puis ouverts avec leur application par défaut. L’aperçu textuel décode uniquement UTF-8 ; si un ancien encodage rend le texte illisible, extrayez-le et ouvrez-le dans un éditeur compatible : ce problème d’affichage est distinct de la préservation des octets d’origine lors de l’extraction.
- Extrayez d’autres formats, dont ALZ et EGG. Toutes les variantes ne sont pas garanties : voir les [limites](../../README.md#지원-범위).
- Automatisez avec la [CLI JSON](../AI_CLI.md) de la même application. Elle ne propose pas la création d’archives découpées.

## Ouvrir et extraire

1. Déposez une archive dans la fenêtre ou utilisez **Ouvrir**. Une sélection composée uniquement d’archives ouvre la première avec un message.
2. Parcourez les dossiers, recherchez et sélectionnez tout ou certains fichiers. Double-cliquez pour prévisualiser ou ouvrir.
3. Lancez l’extraction, choisissez la destination et saisissez le mot de passe demandé. L’extraction automatique enregistre près de l’original ; plusieurs éléments sélectionnés à la racine créent un dossier au nom de l’archive.
4. Traitez les noms identiques, puis vérifiez chemins réels et erreurs. Une annulation ou un échec peut laisser des fichiers déjà terminés. Gardez toutes les parties d’une archive découpée ensemble et ouvrez la première.

## Créer une archive

Déposez ou sélectionnez fichiers/dossiers, réglez format et options, compressez la sélection puis nommez l’archive et choisissez sa destination. Mélanger archives et fichiers ordinaires crée aussi une archive. Le bouton de création convient également. Essayez le niveau équilibré : rapide privilégie le temps, maximal peut être plus lent. Des photos ou vidéos déjà compressées peuvent peu diminuer.

## Langue et informations

Changez la langue en haut ; l’arabe se lit de droite à gauche. Les dialogues macOS suivent le système et certains messages techniques restent dans une autre langue. Le réglage d’application par défaut modifie l’ouverture dans Finder, pas sa commande Compresser.

**ⓘ** réunit auteur, version, guide hors ligne et soutien facultatif. Le bouton des licences ouvre leur dossier dans Finder. Adresse Bitcoin et QR sont également disponibles.

## Noms et performances

Langue de l’interface et encodage des noms sont distincts. UTF-8 et les métadonnées ZIP Unicode valides sont pris en charge. Les anciens ZIP sans indication utilisent une interprétation compatible avec le coréen CP949. Shift-JIS/CP932, GBK ou CP437 non déclarés ne sont pas toujours identifiables. Demandez si nécessaire un ZIP UTF-8 ou un 7Z au créateur. Changer la langue ne répare pas les noms ; extraire ne traduit pas le contenu et n’en modifie pas l’encodage.

La vitesse dépend du format, du nombre de fichiers, du niveau et du stockage. Le [registre de validation](../VALIDATION.md) précise les limites, sans garantir toute archive sans erreur.

## Liberté, contributions et soutien

Les **droits fondamentaux liés au logiciel** expriment notre valeur de développement : chacun, quels que soient ses revenus ou sa langue, devrait pouvoir utiliser les outils numériques essentiels et étudier, modifier, partager leur code et y contribuer. Personnes et IA peuvent partager le savoir, apprendre et créer ensemble.

Le code propre utilise [GPL-3.0-only](../../LICENSE) ; les composants externes conservent leurs licences. Toute contribution est bienvenue. [Buy Me a Coffee](https://buymeacoffee.com/master_chief) et [Ko-fi](https://ko-fi.com/seederpower) sont facultatifs. Merci de conserver les liens vers le projet et le soutien à l’auteur dans vos modifications : cette demande volontaire n’ajoute aucune condition à la GPL.
