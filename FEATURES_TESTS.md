# Features implémentées — Tests à réaliser

> Checklist de tests pour chaque feature ajoutée. Tester sur navigateur (Chrome/Firefox/Safari) et mobile si possible.

---

## L.1 — Gapless playback

| # | Test | Résultat |
|---|------|----------|
| 1 | Lancer un morceau, laisser se terminer → le suivant démarre sans silence | ☐ |
| 2 | Ajouter 3+ morceaux à la file, observer les transitions | ☐ |
| 3 | Répéter un seul morceau (`repeat: one`) → revient à 0 sans trou | ☐ |
| 4 | Répéter toute la liste (`repeat: all`) → boucle sans silence | ☐ |
| 5 | File vide + `repeat: off` → s'arrête proprement | ☐ |
| 6 | Changer de morceau manuellement pendant qu'un autre joue → transition nette | ☐ |

---

## L.2 — Crossfade paramétrable

| # | Test | Résultat |
|---|------|----------|
| 1 | Régler crossfade sur 3s → le fondu dure 3 secondes | ☐ |
| 2 | Régler crossfade sur 0s → pas de fondu (gapless) | ☐ |
| 3 | Régler crossfade sur 12s (max) → fondu long mais correct | ☐ |
| 4 | Changer le crossfade pendant la lecture → prend effet au prochain morceau | ☐ |
| 5 | Mettre en pause pendant un crossfade → le fondu s'arrête proprement | ☐ |
| 6 | Quitter la page pendant un crossfade → pas de fuite mémoire (vérifier console) | ☐ |
| 7 | Crossfade avec shuffle activé → le bon morceau aléatoire est joué | ☐ |
| 8 | Crossfade en fin de file (pas de morceau suivant) → fade out propre | ☐ |

---

## L.3 — ReplayGain

| # | Test | Résultat |
|---|------|----------|
| **Backend** | | |
| 1 | Uploader un MP3 avec tag REPLAYGAIN_TRACK_GAIN → `track.track_gain` est rempli | ☐ |
| 2 | Uploader un fichier sans tag RG → `track.track_gain` est `null` | ☐ |
| 3 | Uploader un FLAC avec tags RG → les valeurs sont extraites correctement | ☐ |
| 4 | Vérifier que `track.track_peak` est rempli si le tag existe | ☐ |
| **Frontend** | | |
| 5 | Toggle ReplayGain ON → le volume est normalisé | ☐ |
| 6 | Toggle ReplayGain OFF → le volume brut est joué | ☐ |
| 7 | Morceau avec gain négatif (-6dB) → le volume est augmenté | ☐ |
| 8 | Morceau avec gain positif (+3dB) → le volume est réduit | ☐ |
| 9 | Changer de morceau → le gain s'adapte au nouveau track | ☐ |
| 10 | Vérifier que le gain ne dépasse pas x3 (limite de sécurité) | ☐ |

---

## L.4 — Égaliseur Web Audio

| # | Test | Résultat |
|---|------|----------|
| 1 | Ouvrir l'égaliseur → les 10 bandes s'affichent à 0 (preset Flat) | ☐ |
| 2 | Régler une bande → le son change en temps réel | ☐ |
| 3 | Preset Bass Boost → les basses sont amplifiées | ☐ |
| 4 | Preset Treble Boost → les aigus sont amplifiés | ☐ |
| 5 | Preset Vocal → les médiums sont accentués | ☐ |
| 6 | Preset Electronic → profil adapté à l'électro | ☐ |
| 7 | Preset Rock → profil rock | ☐ |
| 8 | Toggle OFF → l'EQ est désactivé, son brut revenu | ☐ |
| 9 | Changer de morceau avec EQ activé → les filtres restent actifs | ☐ |
| 10 | Fermer le modal EQ → le son reste filtré (EQ persiste) | ☐ |
| 11 | Vérifier pas de dégradation audio (crackling, popping) | ☐ |
| 12 | Vérifier pas de fuite mémoire (ouvrir/fermer 10x, vérifier console) | ☐ |

---

## L.5 — Lecture variable (podcasts)

| # | Test | Résultat |
|---|------|----------|
| 1 | Sélectionner 0.5x → la lecture est 2x plus lente | ☐ |
| 2 | Sélectionner 1x → vitesse normale | ☐ |
| 3 | Sélectionner 2x → la lecture est 2x plus rapide | ☐ |
| 4 | Sélectionner 3x (max) → vitesse maximale | ☐ |
| 5 | Badge de vitesse s'affiche dans le player quand ≠ 1x | ☐ |
| 6 | Changer de vitesse pendant la lecture → le changement est immédiat | ☐ |
| 7 | Changer de morceau → la vitesse revient à 1x par défaut | ☐ |
| 8 | Vérifier que la voix reste compréhensible à 1.5x et 2x | ☐ |
| 9 | Tester les bornes : essayer 0.4x et 3.1x → sont clippées à 0.5x et 3x | ☐ |

---

## J.1 — Import automatique via JioSaavn API

| # | Test | Résultat |
|---|------|----------|
| **Backend** | | |
| 1 | Rechercher un morceau absent de la BDD → il est trouvé sur JioSaavn | ☐ |
| 2 | Le morceau JioSaavn est automatiquement importé dans la BDD | ☐ |
| 3 | Le fichier audio est uploadé sur MinIO | ☐ |
| 4 | Le track est créé avec le bon titre, artiste, durée | ☐ |
| 5 | L'artiste est créé s'il n'existe pas déjà | ☐ |
| 6 | La tâche Celery de transcodation HLS est déclenchée | ☐ |
| 7 | Un 2ème搜 pour le même morceau ne le réimporte pas (déjà en BDD) | ☐ |
| 8 | Endpoint `/search/jiosaavn?q=...&auto_import=true` retourne les résultats + imported | ☐ |
| 9 | Endpoint `/search/jiosaavn?q=...&auto_import=false` retourne les résultats sans import | ☐ |
| 10 | Recherche locale prioritaire : si le morceau existe en local, pas d'appel JioSaavn | ☐ |
| **Frontend** | | |
| 11 | Rechercher un morceau non présent → les résultats JioSaavn apparaissent | ☐ |
| 12 | Les morceaux importés sont jouables immédiatement | ☐ |
| 13 | Les cover arts JioSaavn s'affichent correctement | ☐ |
| 14 | En cas d'erreur JioSaavn (API down), la recherche locale fonctionne toujours | ☐ |
| **Edge cases** | | |
| 15 | Recherche avec caractères spéciaux (accents, emojis) → pas de crash | ☐ |
| 16 | JioSaavn retourne un fichier trop petit (< 10KB) → rejeté | ☐ |
| 17 | Timeout JioSaavn (> 15s search, > 60s download) → erreur gérée proprement | ☐ |
| 18 | Plusieurs résultats JioSaavn → tous sont importés si auto_import=true | ☐ |

---

## J.2 — MusicBrainz + JioSaavn enrichi

| # | Test | Résultat |
|---|------|----------|
| **MusicBrainz** | | |
| 1 | Recherche "Bohemian Rhapsody" → retourne titre, artiste (Queen), album, durée, ISRC | ☐ |
| 2 | Recherche artiste "Queen" → retourne nom, pays, type | ☐ |
| 3 | Lookup par MusicBrainz ID → retourne les détails complets | ☐ |
| 4 | Timeout MusicBrainz (> 15s) → erreur gérée, fallback sur JioSaavn seul | ☐ |
| **Enriched search** | | |
| 5 | `GET /search/enriched?q=...` → retourne résultats avec métadonnées MusicBrainz | ☐ |
| 6 | Métadonnées MusicBrainz (titre, artiste, album, ISRC) présentes dans la réponse | ☐ |
| 7 | URL de téléchargement JioSaavn trouvée et présente dans la réponse | ☐ |
| 8 | `auto_import=true` → le track est importé dans la BDD avec les métadonnées enrichies | ☐ |
| 9 | `auto_import=false` → résultats retournés sans import | ☐ |
| 10 | JioSaavn ne trouve pas le morceau → `download_url` est null, `imported` est false | ☐ |
| 11 | Track importé avec le titre exact de MusicBrainz (pas celui de JioSaavn) | ☐ |
| 12 | L'artiste MusicBrainz est utilisé pour la création en BDD | ☐ |
| **Intégrité** | | |
| 13 | Les deux APIs appelées en parallèle quand possible (performance) | ☐ |
| 14 | Si MusicBrainz échoue, la recherche JioSaavn seule fonctionne toujours | ☐ |
| 15 | Si JioSaavn échoue, les métadonnées MusicBrainz sont quand même retournées | ☐ |
| 16 | ISRC de MusicBrainz stocké dans le track si disponible | ☐ |

---

## Tests transversaux

| # | Test | Résultat |
|---|------|----------|
| 1 | Toutes les features combinées : crossfade 5s + EQ rock + ReplayGain ON + vitesse 1.5x → fonctionne | ☐ |
| 2 | Navigation rapide entre morceaux → pas de crash ni de bug audio | ☐ |
| 3 | Rafraîchir la page → les settings (crossfade, EQ, vitesse) sont persistés (ou reset à défaut) | ☐ |
| 4 | Console navigateur : 0 erreur JS pendant une session d'écoute de 5 min | ☐ |
| 5 | Mobile (Chrome Android / Safari iOS) : tous les tests passent | ☐ |
| 6 | Vérifier la performance : pas de lag, pas de mémoire qui croît (DevTools Memory tab) | ☐ |

---

*Cocher chaque test une fois validé. En cas d'échec, créer un ticket avec les étapes de reproduction.*
