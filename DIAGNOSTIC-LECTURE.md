# Diagnostic : la lecture de musique ne fonctionne pas

**Site concerné :** https://app.musicgratos.duckdns.org
**Date du diagnostic :** 1er octobre 2026
**Symptôme signalé :** on clique sur le bouton pour jouer une musique, rien ne se lance.

---

## 1. Résumé

**Aucun fichier audio n'est accessible par le backend.**
Toutes les pistes qui ont un fichier en base pointent vers des chemins locaux (`/music/...` ou `/app/downloads/...`), mais le serveur répond **404 « Local file not found »** pour chacune d'entre elles.

C'est un **problème de configuration du serveur** (volumes Docker), pas un bug du code.
Le code aggrave seulement le ressenti, parce que l'erreur n'est affichée nulle part (voir §5).

---

## 2. Ce qui a été constaté

### 2.1 État du catalogue

Relevé via l'API `GET /api/v1/tracks` sur la totalité du catalogue :

| Catégorie | Nombre de pistes | Peut être jouée ? |
|---|---:|---|
| Total en base | **4 499** | |
| Sans aucun fichier audio (`file_url` vide) | **805** | Non, le bouton affiché est « Télécharger depuis YouTube » |
| Fichier dans `local:/music/...` (bibliothèque scannée) | **1 850** | Non, 404 |
| Fichier dans `local:/app/downloads/...` (téléchargements YouTube) | **1 844** | Non, 404 |
| Avec une version HLS (`hls_path`) | **0** | Aucun transcodage n'a été fait |

### 2.2 Test du streaming

Sur 18 pistes testées, prises au hasard dans les deux types de fichiers, toutes répondent :

```
GET /api/v1/tracks/{id}/stream?token=…        (header Range: bytes=0-1023)
→ 404  {"detail": "Local file not found"}
```

Exemples :

| Piste | Fichier en base | Réponse |
|---|---|---|
| Reanimation - Ntr\mssion | `local:/music/Linkin Park discography/Hybrid Theory (20th Anniversary Edition) - Linkin Park/12 - …flac` | 404 |
| Cradles | `local:/app/downloads/Sub Urban - Cradles.flac` | 404 |

Résultat agrégé : **`/music` 8 × 404**, **`/app/downloads` 8 × 404**, plus les 2 tests initiaux, eux aussi en 404.

### 2.3 Page d'accueil

Toutes les cartes de l'accueil sont des pistes **sans fichier audio**. Le bouton qui apparaît au survol est « Télécharger depuis YouTube », pas « Écouter ». Cliquer dessus lance un téléchargement YouTube, pas une lecture.

---

## 3. Méthode utilisée

1. **Connexion au site** dans le navigateur intégré de Claude. L'utilisateur s'est connecté lui-même.
2. **Inspection des boutons** de la page d'accueil. Tous portent le titre « Télécharger depuis YouTube », donc aucune de ces pistes n'a d'audio.
3. **Lecture du catalogue complet** via l'API (`/api/v1/tracks`, 45 pages de 100 pistes), en comptant les pistes avec `file_url` et `hls_path`, puis en les classant selon le préfixe du chemin.
4. **Appels directs à l'endpoint de stream** (`/api/v1/tracks/{id}/stream`) avec le token de la session et un en-tête `Range`, exactement comme le fait le lecteur `<audio>`, sur un échantillon de pistes de chaque type.
5. **Lecture du code backend** pour interpréter la réponse : le message « Local file not found » vient de `stream_local_response()` dans [backend/app/api/v1/stream.py](backend/app/api/v1/stream.py). Il est renvoyé quand `os.path.isfile(path)` est faux, c'est-à-dire quand le fichier n'existe pas **dans le conteneur backend**.
6. **Lecture de [docker-compose.yml](docker-compose.yml)** pour voir comment ces chemins sont montés dans le conteneur.

Aucune donnée n'a été modifiée sur le site : uniquement des requêtes en lecture.

---

## 4. Cause probable et résolution

### 4.1 Comment les fichiers arrivent dans le conteneur

Dans `docker-compose.yml`, le service `backend` monte deux dossiers de l'hôte :

```yaml
environment:
  MUSIC_SCAN_DIR: /music
  MUSIC_DOWNLOAD_DIR: /app/downloads
volumes:
  - ${MUSIC_SCAN_DIR:-./music}:/music:ro
  - ${MUSIC_DOWNLOAD_DIR:-./data/downloads}:/app/downloads
```

- `/music` correspond à la bibliothèque musicale scannée.
- `/app/downloads` correspond aux morceaux téléchargés depuis YouTube.

Si les variables `MUSIC_SCAN_DIR` et `MUSIC_DOWNLOAD_DIR` **ne sont pas définies dans le `.env` du serveur**, Docker utilise les valeurs par défaut `./music` et `./data/downloads`, **relatives au dossier où se trouve le `docker-compose.yml`**.

Les fichiers ont été indexés à un moment où ces dossiers contenaient la musique. Aujourd'hui, le conteneur ne les voit plus. Causes possibles :
- le `.env` a été remplacé ou recréé sans ces deux variables (elles ne figurent pas dans `.env.example`) ;
- le projet a été déplacé ou recloné dans un autre dossier, et `./music` / `./data/downloads` y sont vides ;
- la musique a été déplacée sur l'hôte (autre disque, autre dossier) ;
- un disque ou un partage réseau n'est pas monté sur l'hôte au moment du démarrage du conteneur.

### 4.2 Vérification (sur le serveur)

Depuis le dossier du projet sur le serveur :

```bash
docker compose exec backend env | grep MUSIC
```

```bash
docker compose exec backend ls /music | head
```

```bash
docker compose exec backend ls /app/downloads | head
```

```bash
docker inspect $(docker compose ps -q backend) --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
```

La dernière commande indique **quel dossier de l'hôte** est réellement monté sur `/music` et `/app/downloads`. Si les `ls` sont vides, la cause est confirmée.

### 4.3 Correction

1. Retrouver sur l'hôte le dossier qui contient la bibliothèque (par ex. `/srv/musique`) et celui des téléchargements YouTube.
2. Les déclarer dans le `.env` du serveur, à côté du `docker-compose.yml` :

   ```env
   MUSIC_SCAN_DIR=/srv/musique
   MUSIC_DOWNLOAD_DIR=/srv/alt-spotify/downloads
   ```

   Mettre de préférence des **chemins absolus**, pour ne plus dépendre du dossier d'où le compose est lancé.
3. Recréer le conteneur backend :

   ```bash
   docker compose up -d backend
   ```

4. Vérifier :

   ```bash
   docker compose exec backend ls /music | head
   ```

   Puis lancer une musique sur le site.

**Important :** l'arborescence sous le dossier monté doit être **identique** à celle d'origine. La base stocke le chemin complet (ex. `/music/Linkin Park discography/…`). Si les fichiers ont été réorganisés, il faut relancer un scan de la bibliothèque depuis l'interface d'administration pour mettre les chemins à jour.

### 4.4 Si les téléchargements YouTube ont été perdus

Si le dossier `downloads` d'origine n'existe plus, les 1 844 pistes concernées pointent vers des fichiers disparus. Il faudra soit les retélécharger, soit remettre leur `file_url` à vide pour qu'elles réapparaissent avec le bouton « Télécharger depuis YouTube ».

---

## 5. Problèmes de code associés

Ces points n'empêchent pas la lecture, mais ils ont rendu le problème invisible pour l'utilisateur :

1. **Aucune erreur de lecture n'est affichée.** Le lecteur n'écoute pas l'événement `error` de l'élément `<audio>`, et les échecs de `audio.play()` sont ignorés. Un 404 du stream ne produit donc aucun message, et le bouton reste sur « Pause » comme si la musique jouait.
2. **Aucune piste n'a de version HLS.** Le transcodage (worker) n'a produit aucun `hls_path`. Ce n'est pas bloquant, puisque le lecteur se rabat sur le fichier d'origine, mais il faut vérifier que le worker a lui aussi accès à `/music` et `/app/downloads`.
3. **`MUSIC_SCAN_DIR` et `MUSIC_DOWNLOAD_DIR` ne sont pas documentés** dans `.env.example`, ce qui rend l'oubli facile lors d'une réinstallation.

Corrections proposées : afficher un message et passer à la piste suivante en cas d'erreur de lecture, et ajouter les deux variables commentées dans `.env.example`.

---

## 6. Autre constat : affichage de la barre latérale

En résolution 1280×720, le bloc « Playlists » de la barre latérale est écrasé en bas de l'écran, sur une seule ligne : les playlists ne sont pas accessibles. Deux causes :
- le lecteur en bas de page est en `position: fixed` et recouvre le bas de la barre latérale ;
- la liste des playlists a son propre défilement, et le menu de navigation au-dessus lui laisse presque aucune hauteur.

Ce problème est corrigé sur la branche `Akajox` ([Layout.tsx](frontend/src/components/Layout.tsx), [Player.tsx](frontend/src/components/Player.tsx), [Sidebar.tsx](frontend/src/components/Sidebar.tsx)). Il ne sera visible sur le site qu'après un merge dans `main` et la reconstruction des images Docker, car le serveur utilise les images `ghcr.io/passasa83/alt-spotify-*:main`.
