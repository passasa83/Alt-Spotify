# Features — Alt-Spotify

> Idées de fonctionnalités à implémenter, classées par catégorie et priorité.

---

## 🔴 Haute priorité

### 1. Lecteur Audio Avancé

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| L.1 | **Gapless playback** | Lecture sans interruption entre les morceaux, comme le vrai Spotify | UX majeur |
| L.2 | **Crossfade paramétrable** | Durée de crossfade réglable (0-12s) dans les settings | UX |
| L.3 | **ReplayGain automatique** | Normalisation du volume côté client avec analyse des fichiers à l'upload | Confort |
| L.4 | **Égaliseur 10 bandes** | Réglages prédéfinis (Rock, Jazz, Bass Boost, etc.) + personnalisé | Confort |
| L.5 | **Lecture variable (podcasts)** | Vitesse 0.5x-3x pour les podcasts | Utilitaire |

### 2. Playlists Intelligentes

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| P.1 | **Smart Playlists** | Playlists auto-générées basées sur des règles (noms, BPM, mood, dernier ajouté, etc.) | Discovery |
| P.2 | **Historique complet** | Liste chronologique de tout ce qui a été écouté avec filtres | Utilitaire |
| P.3 | **Top du mois/année** | Playlists automatiques "Your Top Songs 2026" | Engagement |
| P.4 | **Doublons détection** | Détecter et signaler les morceaux en doublon dans une playlist | Utilitaire |

### 3. Recherche Avancée

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| R.1 | **Recherche par BPM** | Filtrer par tempo (ex: 120-140 BPM) | DJ/Production |
| R.2 | **Recherche par tonalité** | Filtrer par clé musicale (Am, Cm, etc.) | DJ/Production |
| R.3 | **Recherche par mood** | Tags de mood (energetic, calm, sad, party...) | Découverte |
| R.4 | **Recherche dans les paroles** | Full-text search sur les lyrics LRC | Découverte |
| R.5 | **Filtres combinés** | Genre + BPM + durée + année + territoire en même temps | Utilitaire |

---

## 🟠 Moyenne priorité

### 4. Social & Découverte

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| S.1 | **Feed d'activité temps réel** | Voir ce que les gens suivis écoutent en direct (WebSocket) | Social |
| S.2 | **Playlists collaboratives temps réel** | Édition simultanée de playlists avec WebSocket | Social |
| S.3 | **Partage avec prévisualisation** | Quand on partage un morceau, le destinataire peut écouter un extrait de 30s | Social |
| S.4 | **Comments sur les playlists** | Commentaires publics/privés sur les playlists | Social |
| S.5 | **Sondages musicaux** | "A ou B ?" entre deux morceaux, partagé avec les amis | Fun |
| S.6 | **Anniversaire musical** | Notification "Il y a X ans tu écoutais..." | Engagement |

### 5. Recommandations IA

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| I.1 | **Recommandations par mood** | "Mets-moi quelque chose de chill pour travailler" | Discovery |
| I.2 | **Recommandations contextuelles** | Basées sur l'heure, la météo, l'activité (running, cuisine...) | Discovery |
| I.3 | **Analyse de goût** | Dashboard montrant l'évolution de ses goûts musicaux | Engagement |
| I.4 | **"Discover Weekly" amélioré** | Basé sur les genres, pas juste l'historique d'écoute | Discovery |
| I.5 | **Similar Artists avancé** | "Artistes similaires à X mais moins connus" | Découverte |

### 6. Offline & Sync

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| O.1 | **Mode offline complet** | Toute l'app fonctionne sans internet (cache intelligent) | Mobile |
| O.2 | **Sync sélective** | Choisir quels playlists/albums sync automatiquement | Mobile |
| O.3 | **Qualité offline** | Choisir la qualité des téléchargements (96k/160k/320k) | Mobile |
| O.4 | **Gestion stockage** | Voir l'espace utilisé, purger les anciens téléchargements | Mobile |

### 7. Notifications & Alertes

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| N.1 | **Nouvel album d'un artiste suivi** | Push + in-app notification | Engagement |
| N.2 | **Concert à proximité** | Alertes basées sur la localisation | Découverte |
| N.3 | **Playlist mise à jour** | Quand une playlist collaborative qu'on suit est modifiée | Social |
| N.4 | **Rappel d'écoute** | "Tu n'as pas écouté de musique depuis 3 jours" | Engagement |

---

## 🟩 Basse priorité

### 8. Intégrations Externes

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| E.1 | **Last.fm scrobbling** | Scrobble automatique vers Last.fm | Compatibilité |
| E.2 | **Discord Rich Presence** | Afficher ce qu'on écoute sur Discord | Social |
| E.3 | **OBS Overlay** | Widget pour streamers affichant le morceau en cours | Créateurs |
| E.4 | **Shortcuts clavier** | Espace=play/pause, ←→=seek, ↑↓=volume | Utilitaire |
| E.5 | **Partage social** | Share vers Twitter/Instagram Stories avec preview | Social |

### 9. Création de Contenu

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| C.1 | **Mix builder** | Outil pour créer des mixsets avec transition automatique | DJ |
| C.2 | **Playlist comments enrichis** | Timestamps + commentaires sur les morceaux | Social |
| C.3 | **Notes personnelles** | Notes privées sur les morceaux/albums | Utilitaire |
| C.4 | **Tags personnalisés** | Tags libres sur les morceaux (ex: "workout", "chill") | Organisation |

### 10. Accessibilité & UX

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| A.1 | **Thème sombre/clair** | Toggle entre les thèmes | Accessibilité |
| A.2 | **Taille de texte** | Police ajustable (small/normal/large) | Accessibilité |
| A.3 | **Contraste élevé** | Mode haute contraste pour malvoyants | Accessibilité |
| A.4 | **Skeleton loading** | Placeholder animé pendant le chargement | Perceived perf |
| A.5 | **Animations réduites** | Respecter `prefers-reduced-motion` | Accessibilité |

### 11. Admin & Monitoring

| # | Feature | Description | Impact |
|---|---------|-------------|--------|
| D.1 | **Audit log** | Historique des actions admin (upload, supression, ban) | Sécurité |
| D.2 | **Usage analytics** | Graphiques d'utilisation (écoute par jour/semaine/mois) | Admin |
| D.3 | **Batch upload** | Upload de plusieurs fichiers en une fois avec progression | Admin |
| D.4 | **Auto-tagging** | Extraction automatique des métadonnées (genre, BPM, key) | Admin |
| D.5 | **Maintenance mode** | Toggle pour mettre l'app en maintenance | Admin |

---

## Roadmap suggérée

| Phase | Durée | Features |
|-------|-------|----------|
| **Phase 1** | 2 semaines | L.1, L.2, P.1, R.1-R.3, A.4-A.5 |
| **Phase 2** | 3 semaines | S.1-S.3, I.1-I.2, O.1-O.2, N.1 |
| **Phase 3** | 3 semaines | L.3-L.5, P.2-P.4, R.4-R.5, O.3-O.4 |
| **Phase 4** | 4 semaines | S.4-S.6, I.3-I.5, E.1-E.3, N.2-N.4 |
| **Phase 5** | 4 semaines | C.1-C.4, D.1-D.5, A.1-A.3, E.4-E.5 |

---

*Chaque feature devrait avoir son propre ticket/issue avec spécifications détaillées avant implémentation.*
