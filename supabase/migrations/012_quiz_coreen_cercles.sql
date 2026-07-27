-- Migration 012 — Quiz coréen ouvert aux cercles (lecture seule).
--
-- `coreen_units`/`coreen_items` (le vocabulaire) étaient jusqu'ici réservés
-- à Moi comme le reste de l'onglet Coréen (migration 006). On ouvre
-- uniquement la LECTURE de ces deux tables aux cercles (Parents/Famille/
-- Amis/Copain), pour un mini quiz côté cercle.html — voir
-- assets/js/quiz-coreen.js. `coreen_progress`/`coreen_stats` (progression
-- et XP personnels de Léona) restent strictement Moi-only, on n'y touche
-- pas : le quiz côté cercles n'écrit jamais rien en base.
create policy "vocabulaire coréen lisible par les cercles (unités)" on coreen_units for select using (true);
create policy "vocabulaire coréen lisible par les cercles (items)" on coreen_items for select using (true);
