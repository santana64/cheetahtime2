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

Prérequis : Node 20+ et les dépendances installées (`npm install`).

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
