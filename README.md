# Les K-Chroniques de Léona

Journal de voyage privé (PVT Corée du Sud) — site 100 % statique (HTML/CSS/JS,
aucun outil de build) + Supabase.

Aucune installation n'est nécessaire pour faire tourner ce site : pas de
Node.js, pas de `npm install`. Le navigateur appelle Supabase directement.

## Comment ça marche (en bref)

- **Pas de build.** Tous les fichiers sont servis tels quels. Ouvrir
  `index.html` (via un petit serveur local, voir plus bas) ou déployer le
  dossier sur n'importe quel hébergeur statique suffit.
- **Un seul vrai verrou de sécurité : le compte "Moi".** Créer/modifier les
  Récits, les Lettres, le Bandeau et les Finances nécessite d'être connectée
  avec le compte Supabase Auth de Léona (email + mot de passe). C'est la
  seule chose qui est réellement protégée côté base de données (RLS).
- **Les codes des 4 autres cercles sont une simple politesse, pas une
  sécurité.** Ils sont écrits en clair dans `assets/js/config.js` et
  seulement vérifiés dans le navigateur. N'importe qui d'un peu curieux
  avec les outils de développeur pourrait contourner le filtre par cercle
  (par ex. lire une Lettre en tant que Famille). Accepté sciemment vu le
  contexte (proches, pas un site sensible) — voir la note en haut de
  `supabase/schema.sql`.

## 1. Créer le projet Supabase

1. Crée un projet sur [supabase.com](https://supabase.com) (gratuit).
2. **SQL Editor** → colle et exécute tout le contenu de
   [`supabase/schema.sql`](supabase/schema.sql). Ça crée les tables, les
   règles de sécurité (RLS) et la fonction `reste_a_vivre_du_mois()`.
3. **Storage** → crée un bucket nommé `photos`, coche **Public bucket**.
4. **Authentication → Users → Add user** → crée UN compte pour toi
   (Léona), avec l'email et le mot de passe de ton choix. C'est ce compte
   qui te connecte sur `moi.html`. Personne d'autre n'a besoin de compte.

## 2. Remplir la config

Ouvre [`assets/js/config.js`](assets/js/config.js) et remplace :

- `SUPABASE_URL` et `SUPABASE_ANON_KEY` — Project Settings > API (la clé
  "anon" est faite pour être publique, ce n'est pas un secret à cacher).
- Les 4 codes dans `ACCESS_CODES` (`parents`, `famille`, `amis`, `copain`) —
  ce que tu veux, ce sont juste des mots de passe symboliques.

Fais la même chose dans
[`.github/workflows/ping-supabase.yml`](.github/workflows/ping-supabase.yml)
(mêmes `SUPABASE_URL` / clé anon, voir étape 5).

## 3. Tester en local (optionnel)

Comme les pages utilisent des modules JavaScript (`type="module"`), les
ouvrir directement en double-cliquant (`file://...`) ne fonctionnera pas à
cause des restrictions de sécurité du navigateur — il faut un petit serveur
local. Si tu as Python d'installé :

```
python -m http.server 8080
```

puis ouvre `http://localhost:8080`. Sinon, l'extension VS Code **Live
Server** fait la même chose en un clic. Aucun des deux n'est obligatoire :
tu peux aussi tester directement en ligne après déploiement (étape 4).

## 4. Déployer

N'importe quel hébergeur statique fonctionne, aucun n'a besoin de "build
command" (laisse ce champ vide si on te le demande) :

- **Vercel** — importe le repo GitHub, ne touche à aucun réglage, déploie.
- **GitHub Pages** — Settings > Pages > Deploy from branch, choisis `main`.
  Avantage : zéro compte supplémentaire, tu as déjà GitHub.
- **Netlify** — pareil que Vercel.

## 5. Le cron quotidien (garder Supabase actif)

Le plan gratuit Supabase met le projet en pause après 7 jours sans
activité. [`.github/workflows/ping-supabase.yml`](.github/workflows/ping-supabase.yml)
fait un appel quotidien automatique (6h UTC) dès que ce fichier est sur
GitHub — rien à activer, GitHub Actions le détecte tout seul. Vérifiable
dans l'onglet **Actions** du repo (tu peux aussi le lancer à la main avec le
bouton "Run workflow").

## Mise à jour : jalons, galerie, carte (migration 001)

Si ton projet Supabase existe déjà (créé avant cette mise à jour), va dans
**SQL Editor** et exécute le contenu de
[`supabase/migrations/001_jalons_et_carte.sql`](supabase/migrations/001_jalons_et_carte.sql)
une seule fois. Ça ajoute :
- `status_banner.depart_date` — renseigne-la dans `moi.html` > Bandeau pour
  activer les jalons automatiques sur la Timeline ("1 mois sur place !").
- `entries.lat` / `entries.lng` — renseigne-les (optionnel) sur un récit dans
  `moi.html` pour qu'il apparaisse sur la Carte.

(Pour une toute nouvelle installation, ces colonnes sont déjà incluses dans
`schema.sql`, pas besoin de rejouer la migration séparément.)

La Carte utilise [Leaflet](https://leafletjs.com/) chargé depuis un CDN
(unpkg) — seule nouvelle dépendance externe du site, aucune installation
nécessaire.

## Ce qui est en place

- **Accès par code** (Parents / Famille / Amis / Copain) — `acceder.html`,
  filtre client-side, voir l'avertissement de sécurité plus haut.
- **Compte Moi réel** (Supabase Auth) — seule vraie protection du site,
  couvre l'écriture des récits/lettres/photos/finances/bandeau.
- **Timeline / Récits / Lettres** avec réactions emoji et commentaires,
  boîte à questions, bandeau "où j'en suis" — `cercle.html`.
- **Résumé Finances "reste à vivre"** affiché automatiquement côté Parents,
  via la fonction SQL `reste_a_vivre_du_mois()` — c'est la seule donnée
  financière qui a une vraie protection en base (le détail par catégorie
  reste inaccessible sans le compte Moi, même en lecture).
- **Upload de photo avec compression automatique** (redimensionnement
  1600px, JPEG) — `assets/js/compress-image.js`, invisible pour
  l'utilisatrice.
- **Finances** — reprise fidèle du prototype validé, connectée à Supabase —
  `assets/js/finances.js`.
- **Accent de couleur saisonnier** automatique — `assets/js/season.js`.
- **Cron GitHub Actions** quotidien pour éviter la pause Supabase.
- **Galerie photo** dédiée, regroupant toutes les photos visibles pour le
  cercle connecté — onglet Galerie de `cercle.html`.
- **Jalons automatiques sur la Timeline** ("1 mois sur place !"), calculés
  à partir de la date de départ renseignée dans le Bandeau.
- **Carte interactive** (Leaflet/OpenStreetMap) des lieux visités, à partir
  des coordonnées GPS renseignées sur les récits — onglet Carte.
- **Site installable + notifications push** — icône sur l'écran d'accueil
  (Android et iPhone) et notification à chaque récit/lettre publié. Voir la
  section dédiée ci-dessous pour la mise en place (une seule fois).
- **Onglet Coréen** (`moi.html` uniquement, jamais visible des cercles) —
  apprentissage du coréen façon Duolingo : unités (Hangul, salutations,
  nombres, nourriture...), répétition espacée (Leitner), QCM/frappe/écoute
  (synthèse vocale native du navigateur), XP et streak. Contenu de départ
  d'une centaine de mots/phrases, extensible depuis l'onglet lui-même
  ("+ Ajouter un mot"). Rien à configurer en plus du reste : la migration
  `006_coreen.sql` (déjà incluse dans `schema.sql`) suffit.
- **Espace perso** (`moi.html` uniquement, jamais visible des cercles) :
  **Journal** intime privé avec suivi d'humeur, **Checklist PVT** (visa,
  ARC, ouverture de compte...) avec rappel push automatique si un point
  traîne plus de 10 jours, **Fiche d'urgence** (contacts, assurance,
  numéros coréens), **Envies** (lieux/restos à ne pas oublier, avec carte),
  **Bloc-notes** rapide. Contenu créé par la migration `007_espace_perso.sql`
  (déjà incluse dans `schema.sql`). Le rappel de checklist réutilise les
  notifications push — voir la sous-section dédiée ci-dessous.

## Notifications push (site installable façon appli)

Le site peut maintenant s'installer comme une vraie application (icône,
notifications), grâce à `manifest.json` et `sw.js`. Ça demande une mise en
place en plus des étapes précédentes, à faire une seule fois.

### 1. Clés VAPID

Une paire de clés a déjà été générée. La clé **publique** est déjà dans
`assets/js/config.js` (`VAPID_PUBLIC_KEY`) — rien à faire. La clé **privée**
t'a été donnée séparément (dans la conversation qui a mis ça en place) :
garde-la précieusement, mais ne la mets JAMAIS dans un fichier du repo —
uniquement dans les secrets Supabase (étape 3). Si tu la perds un jour,
n'importe quel générateur de clés VAPID standard permet d'en recréer une
nouvelle paire ; il faudra alors redemander à chacun de réactiver ses
notifications.

### 2. Déployer la fonction d'envoi

Nécessite le [CLI Supabase](https://supabase.com/docs/guides/cli) (à
installer une seule fois) :

```
supabase login
supabase link --project-ref <ton-project-ref>
supabase functions deploy send-push
```

Pas de `--no-verify-jwt` ici (contrairement à `checklist-reminder`
ci-dessous) : cette fonction est appelée directement depuis le navigateur
de Léona (bouton "Envoyer la notification" dans l'éditeur d'un récit/d'une
lettre), donc Supabase vérifie qu'un vrai jeton de connexion accompagne
l'appel. La fonction vérifie en plus elle-même que ce jeton correspond à un
compte Supabase Auth authentifié (donc "Moi" — le seul qui existe sur ce
projet) avant d'envoyer quoi que ce soit.

### 3. Configurer les secrets de la fonction

```
supabase secrets set VAPID_PUBLIC_KEY="<la clé publique>" VAPID_PRIVATE_KEY="<la clé privée>"
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont
fournies automatiquement à toute Edge Function, rien à configurer pour
celles-ci.)

### 4. Exécuter la migration `008_entry_notifications.sql`

Dans le **SQL Editor** Supabase, colle et exécute le contenu de
[`supabase/migrations/008_entry_notifications.sql`](supabase/migrations/008_entry_notifications.sql)
(ajoute la colonne `notified_circles` sur `entries`).

**Si tu avais déjà configuré l'ancien système (avant cette mise à jour) :**
supprime le Database Webhook existant — tableau de bord Supabase →
**Database** → **Webhooks** — celui pointant vers `send-push` sur la table
`entries`. Il n'est plus utilisé (les notifs ne partent plus
automatiquement à la publication, voir plus bas) et Supabase rejetterait de
toute façon ses appels maintenant que la fonction vérifie un jeton de
connexion.

### 5. Tester

Ouvre le site sur un téléphone (via un lien de cercle), et clique sur
"🔕 Activer les notifs" en haut de `cercle.html`. Sur iPhone, il faut
d'abord ajouter le site à l'écran d'accueil (Partager → Sur l'écran
d'accueil) — le bouton l'explique automatiquement si ce n'est pas encore
fait. Publie ensuite un récit depuis `moi.html`, ouvre-le à nouveau et
utilise le bloc "Notifier" en bas de l'éditeur pour cocher un cercle et
envoyer : la notification doit arriver en quelques secondes.

Rien n'est envoyé automatiquement à la publication — c'est Léona qui
choisit, entrée par entrée, quel(s) cercle(s) prévenir (et peut rouvrir une
entrée plus tard pour renvoyer une notif à un cercle oublié). Comme pour les
codes de cercle, aucune donnée sensible ne transite dans ces notifs (juste
un titre de récit) — voir la note de sécurité en haut de
`supabase/schema.sql`.

### 6. (Optionnel) Rappels de checklist

La Checklist PVT (`moi.html` → onglet Checklist) peut te notifier
elle-même quand un point traîne depuis plus de 10 jours sans être coché.
Ça réutilise tout ce qui précède (mêmes clés VAPID), avec juste deux ajouts :

```
supabase functions deploy checklist-reminder --no-verify-jwt
```

Puis active les notifications depuis `moi.html` elle-même (bouton
"🔕 Activer les notifs" en haut, à côté de "Se déconnecter") — c'est
indépendant de l'activation faite depuis `cercle.html`, il faut le faire
une fois sur ton propre téléphone/ordinateur.

Le workflow `.github/workflows/checklist-reminder.yml` (déjà dans le repo,
rien à faire) appelle cette fonction une fois par jour à 8h UTC — dès que
ce fichier est sur GitHub, l'exécution est automatique, comme pour le ping
Supabase quotidien.

### 7. (Optionnel) Notification à Moi quand un cercle commente

Léona peut être notifiée (push) quand quelqu'un commente un récit ou une
lettre — au plus une notif par (entrée, cercle) tant qu'elle n'a pas rouvert
l'entrée dans l'admin, pour ne pas être submergée si plusieurs commentaires
arrivent avant qu'elle ne regarde. Un badge rouge sur les onglets
Récits/Lettres indique aussi les entrées avec des commentaires non lus,
indépendamment des notifs push.

```
supabase functions deploy notify-comment --no-verify-jwt
```

`--no-verify-jwt` ici : contrairement à `send-push`, cette fonction est bien
appelée par Supabase lui-même (le Database Webhook ci-dessous), pas par une
personne connectée.

Puis, dans le **SQL Editor**, exécute
[`supabase/migrations/011_comments_seen_by_moi.sql`](supabase/migrations/011_comments_seen_by_moi.sql),
et crée un nouveau **Database Webhook** (Dashboard → **Database** →
**Webhooks**) :

- Table : `comments`
- Events : `Insert`
- Type : `Supabase Edge Functions`
- Function : `notify-comment`

Enfin, active les notifications depuis `moi.html` elle-même (bouton
"🔕 Activer les notifs" en haut) si ce n'est pas déjà fait — voir
étape 6 ci-dessus.

## Ce qu'il reste à faire

- **Export album souvenir** : explicitement hors scope V1, voir le cahier
  des charges.
- Rien n'a pu être testé dans un vrai navigateur pendant l'écriture de ce
  code (pas d'environnement disponible) — attends-toi à corriger deux ou
  trois petits bugs à la première utilisation réelle. C'est également vrai
  pour la mise à jour Galerie/Jalons/Carte : vérifie-la en local avant de
  déployer (voir plus haut pour lancer un petit serveur local).
