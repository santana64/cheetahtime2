# Cheetah Time

Cheetah Time est l'application metier de planification du depot interne `cheetahproject`. Le produit vise une experience proche de Microsoft Project: WBS, taches hierarchiques, dependances, Gantt, ressources, baselines, couts, risques, changements, reporting et interoperabilite planning.

## Surfaces Produit

- Accueil et navigation en francais sous la marque Cheetah Time.
- Auth beta fermee: utilisateur, session HTTP-only, workspace, role, lockout apres echecs, MFA TOTP optionnel et base RBAC.
- Portfolio projets par workspace avec creation, duplication, archivage, restauration, suppression, export et creation depuis modele.
- Dashboard projet avec sante planning, chemin critique, jalons proches, variance baseline, charge ressource, couts et earned value.
- Workspace planning avec grille de taches synchronisee au Gantt, inspecteur, WBS, taches recapitulatives, jalons, dependances et ressources sur les barres.
- Gantt direct: glisser-deposer des barres, resize debut/fin et deplacement des jalons, avec sauvegarde en planification manuelle et recalcul planning.
- Ressources avec capacite, affectations, calendriers ressource, temps consomme, couts reels et surcharge.
- Baselines avec capture, historique, activation et comparaison dates / travail / cout.
- Registres risques, incidents et demandes de changement.
- Collaboration tache: commentaires, mentions `@email`, notifications in-app, notifications externes via webhooks, pieces jointes lien/reference et upload binaire local.
- Parametres workspace: devise, fuseau horaire, exercice fiscal, notifications, Slack, Teams, Jira et securite MFA.
- Reporting exportable: JSON, CSV, Excel-compatible `.xls`, PDF simple et burndown CSV.
- Import/export planning: round-trip MSPDI XML et import natif MPP via MPXJ.

## Persistance

La voie produit primaire est Prisma + PostgreSQL.

- `DATABASE_URL` + `CHEETAH_TIME_PERSISTENCE=prisma` force le mode base de donnees.
- `CHEETAH_TIME_PERSISTENCE=auto` utilise Prisma si `DATABASE_URL` est disponible, sinon le store local.
- Le fallback local reste explicite pour developpement sans PostgreSQL: `data/cheetah-time.local.json`.
- Les uploads binaires locaux sont stockes sous `data/attachments/` et ignores par Git.
- Les migrations SQL sont versionnees dans `prisma/migrations/`.
- `npm run verify:prisma-postgres` demarre une vraie base PostgreSQL embarquee, applique les migrations et verifie la persistance.

Modeles Prisma principaux:

- `Workspace`, `WorkspaceSettings`, `User`, `WorkspaceMember`, `Session`
- `Project`, `ProjectCalendar`, `Task`, `Dependency`
- `Resource`, `Assignment`, calendriers tache/ressource
- `Baseline`, `BaselineTaskSnapshot`
- `TimesheetEntry`, `ActualCostEntry`
- `RiskItem`, `IssueItem`, `ChangeRequest`
- `TaskComment`, `TaskAttachment`, `ActivityEvent`, `Notification`
- `ProjectTemplate`

## Moteur Planning

Le moteur dans `src/lib/planning/` supporte:

- taches hierarchiques et WBS
- taches recapitulatives avec rollups
- jalons
- dependances `FS`, `SS`, `FF`, `SF`
- lag et lead via `lagDays`
- dependances inter-projets
- detection de cycles et tri topologique
- forward pass et backward pass
- earliest/latest start/finish
- total slack et free slack
- chemin critique
- jours ouvres et exceptions calendrier
- contraintes `ASAP`, `SNET`, `SNLT`, `FNET`, `FNLT`, `MSO`, `MFO`
- modes `AUTO` et `MANUAL`
- formules `FIXED_DURATION`, `FIXED_WORK`, `FIXED_UNITS`
- calendriers projet, tache et ressource
- nivellement ressource projet et workspace
- actuals, timesheets, couts reels et earned value

Les surfaces planning lisent les resultats calcules; le Gantt n'est pas decoratif.

## Auth, RBAC Et MFA

Cheetah Time inclut maintenant:

- `src/proxy.ts` : garde central sur toutes les routes `/api` (401 sans session, 403 si le role ne couvre pas la methode HTTP).
- Pages produit protegees par le layout `(product)` (redirection vers `/login`).
- Mode desktop (Electron) : pas d'ecran de login, mais un jeton aleatoire par lancement (`CHEETAH_DESKTOP_TOKEN`) pose en cookie HTTP-only sur la seule fenetre de l'app ; tout autre client local est refuse.
- Sessions stockees par hash de token.
- Cookie `cheetah_time_session` HTTP-only.
- Bootstrap workspace/admin.
- Lockout temporaire apres echecs de connexion.
- MFA TOTP activable dans `/settings`.
- Roles `OWNER`, `ADMIN`, `PLANNER`, `VIEWER` avec matrice de permissions cote serveur.

Variables utiles:

- `CHEETAH_TIME_BOOTSTRAP_EMAIL`
- `CHEETAH_TIME_BOOTSTRAP_PASSWORD`
- `CHEETAH_TIME_BOOTSTRAP_NAME`
- `CHEETAH_TIME_SESSION_DAYS`
- `CHEETAH_TIME_AUTH_SECRET`

En production, `CHEETAH_TIME_BOOTSTRAP_PASSWORD` (12 caracteres min.) et `CHEETAH_TIME_AUTH_SECRET` (32 caracteres min., chiffre les secrets MFA) sont obligatoires : il n'y a plus de mot de passe par defaut.

Limite: ce n'est pas encore du SSO enterprise complet avec SAML/OIDC, SCIM ou politiques conditionnelles avancees.

## Collaboration, Notifications Et Fichiers

Fonctionnel:

- commentaires sur taches
- mentions `@email`
- notifications in-app
- dispatch externe via webhooks Email, Slack, Teams et Jira si configures
- pieces jointes lien/reference
- uploads binaires locaux avec checksum SHA-256
- route securisee de telechargement des pieces jointes binaires
- journal d'activite projet
- risques, incidents et demandes de changement

Variables providers:

- `CHEETAH_TIME_EMAIL_WEBHOOK_URL`
- `CHEETAH_TIME_SLACK_WEBHOOK_URL`
- `CHEETAH_TIME_TEAMS_WEBHOOK_URL`
- `CHEETAH_TIME_JIRA_WEBHOOK_URL`
- `CHEETAH_TIME_MAX_ATTACHMENT_BYTES`

Limites: pas encore de stockage objet S3/Azure Blob, pas de Slack/Jira OAuth natif, pas de presence temps reel.

## Interoperabilite

Support reel:

- export MSPDI XML
- import MSPDI XML
- round-trip XML verifie par script
- import natif MPP via MPXJ bridge
- demande `format=mpp` sans export natif disponible: retourne un MSPDI XML exploitable avec en-tetes explicites au lieu d'une erreur 501

Limite assumee:

- l'export binaire natif `.mpp` n'est pas disponible avec le bridge open-source actuel. La voie fiable reste MSPDI XML.

## Commandes

Installation:

```bash
npm install
npm run dev
```

Mode PostgreSQL:

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

Validation complete:

```bash
npx prisma generate
npm run typecheck
npm run lint
npm run verify:backend
npm run verify:interop
npm run verify:prisma-postgres
npm run build
```

Raccourci:

```bash
npm run verify:all
```

Installateur Windows (Electron + NSIS):

```bash
npm run desktop
```

Sortie: `dist-desktop/Cheetah-Time-Setup-<version>.exe`. Le depot doit etre clone
dans un chemin court (ex. `C:\ct\repo`): `makensis.exe` n'est pas long-path aware
et l'etape `desktop:dist` echoue au-dela de 260 caracteres. Details, stockage des
donnees et notes SmartScreen: `docs/DESKTOP.md`.

## Architecture

- `src/app/`: App Router, pages, layouts, API handlers et proxy.
- `src/features/projects/`: surfaces projet, actions serveur et composants metier.
- `src/features/auth/`: login/logout.
- `src/features/settings/`: workspace settings et securite MFA.
- `src/services/projects.ts`: mutations centrales projet/planning.
- `src/services/project-store.ts`: selection Prisma/local.
- `src/services/prisma-store.ts`: persistance PostgreSQL.
- `src/services/local-store.ts`: fallback local.
- `src/services/auth.ts`: identite, sessions, MFA, RBAC.
- `src/services/comments.ts`, `attachments.ts`, `activity.ts`, `notifications.ts`: collaboration.
- `src/services/controls.ts`, `risks.ts`: risques, incidents et changements.
- `src/services/reports.ts`: exports reporting.
- `src/lib/planning/`: moteur planning.
- `src/lib/interop/`: MSPDI XML et bridge MPP.
- `prisma/schema.prisma`: modele PostgreSQL.
- `scripts/verify-*.ts`: preuves backend.

## Limites Restantes Honnetes

- Pas encore de SSO SAML/OIDC, SCIM ou MFA impose par politique d'organisation.
- Pas encore de stockage objet cloud pour les fichiers binaires.
- Pas encore d'integration OAuth native Slack/Jira/Teams; les envois externes passent par webhooks.
- Pas encore d'export binaire `.mpp` natif.
- Le fallback local existe toujours pour developpeur sans PostgreSQL; le chemin produit recommande est Prisma/PostgreSQL.
