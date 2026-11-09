# Cheetah Time — version Desktop (Windows)

Cheetah Time est empaqueté en application de bureau **Windows** avec **Electron**.
L'application embarque le serveur Next.js (mode `output: standalone`) et l'affiche
dans une fenêtre. **100 % local** : les données sont stockées sur le PC, aucune
base de données ni connexion réseau n'est requise.

## Ce qui est produit

Après un build, l'installateur se trouve ici :

```
dist-desktop/Cheetah-Time-Setup-0.1.0.exe
```

C'est ce fichier `.exe` que vous envoyez à François. À l'installation :

- raccourcis Bureau + menu Démarrer « Cheetah Time » ;
- choix du dossier d'installation possible ;
- désinstallation propre via « Ajouter/supprimer des programmes ».

## Où sont stockées les données ?

Dans le profil Windows de l'utilisateur :

```
%APPDATA%\Cheetah Time\cheetah-time.local.json
```

Au premier lancement, le portefeuille de démonstration est créé automatiquement.
Les données restent sur la machine de l'utilisateur (rien n'est envoyé en ligne,
la clé de base distante n'est **pas** embarquée).

## Reconstruire l'installateur

Prérequis :

- Node 20+ et les dépendances installées (`npm install`) ;
- **le dépôt doit être cloné dans un chemin court** — voir la contrainte ci-dessous.

```bash
npm run desktop
```

Cette commande enchaîne :

1. `desktop:icon`     — génère `build/icon.ico` (marque Cheetah).
2. `desktop:build`    — `next build` avec `CHEETAH_DESKTOP=1` (sort `.next/standalone`).
3. `desktop:assemble` — copie `public/` et `.next/static` dans le bundle standalone.
4. `desktop:dist`     — `electron-builder` produit `dist-desktop/Cheetah-Time-Setup-<version>.exe`.

Pour tester la fenêtre en local sans installer (après les étapes 1–3) :

```bash
npm run desktop:run
```

## Contrainte : construire depuis un chemin court (MAX_PATH)

**Clonez le dépôt dans un chemin court**, par exemple `C:\ct\repo` ou `C:\dev\cheetah`.
Les étapes 1 à 3 fonctionnent depuis n'importe quel dossier, mais l'étape 4
(`desktop:dist`) échoue si le chemin du projet est trop long :

```
⨯ makensis.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
!include: could not open file: "…\node_modules\app-builder-lib\templates\nsis\include\allowOnlyOneInstallerInstance.nsh"
Error in script "<stdin>" on line 88 -- aborting creation process
```

Le fichier existe bel et bien : `makensis.exe` n'est pas *long-path aware* et
plafonne à la limite Windows historique de **260 caractères**. Le chemin ci-dessus
ajoute environ **85 caractères** à la racine du projet, donc tout dossier projet
dépassant ~175 caractères casse le build.

Diagnostic en une commande (PowerShell, à la racine du projet) :

```powershell
"$((Get-Location).Path)\node_modules\app-builder-lib\templates\nsis\include\allowOnlyOneInstallerInstance.nsh".Length
```

Au-delà de 260, relancez le build depuis un chemin plus court.

Points à connaître :

- **Une jonction de répertoire ne suffit pas.** `New-Item -ItemType Junction -Path C:\ct2
  -Target <chemin long>` ne corrige rien : electron-builder résout le chemin réel
  avant d'appeler `makensis.exe`, qui reçoit donc à nouveau le chemin long.
- **N'attendez rien de `LongPathsEnabled`** (chemins longs Windows) : l'opt-in
  registre n'agit que sur les binaires qui déclarent le manifeste `longPathAware`,
  ce que `makensis.exe` ne fait pas. *Non verifie sur ce poste — le contournement
  ci-dessous, lui, est verifie.*
- La solution fiable est donc de **déplacer ou recopier le projet** dans un chemin
  court, puis d'y relancer `npm run desktop:dist`. Le `node_modules` doit suivre ;
  en recopie, `robocopy <source> C:\ct\repo /E /MT:16 /XD dist-desktop` fait le travail.

## Pièces du montage

| Fichier | Rôle |
|---------|------|
| `electron/main.js` | Démarre le serveur Next embarqué sur un port libre, ouvre la fenêtre, force la persistance locale. |
| `electron/preload.js` | Preload minimal (isolation de contexte). |
| `electron-builder.yml` | Configuration de l'installateur NSIS Windows. |
| `scripts/assemble-standalone.mjs` | Copie `public/` + `.next/static` dans `.next/standalone`. |
| `scripts/make-icon.mjs` | Génère l'icône `.ico` de l'application. |
| `next.config.ts` | `output: 'standalone'` activé uniquement si `CHEETAH_DESKTOP=1`. |

## À savoir avant d'envoyer à François

- **SmartScreen / Windows Defender** : l'installateur n'est **pas signé**
  numériquement. Au premier lancement, Windows peut afficher « Windows a protégé
  votre ordinateur » → cliquer sur **Informations complémentaires** puis
  **Exécuter quand même**. C'est normal pour un logiciel interne non signé.
  Pour supprimer cet avertissement, il faudrait un certificat de signature de code.
- **Taille** : l'installateur pèse ~120 Mo (Electron + serveur Next embarqué).
- **Antivirus** : préférez un envoi via un lien (WeTransfer, OneDrive…) — les
  pièces jointes `.exe` sont souvent bloquées par les messageries.
