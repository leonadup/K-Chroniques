-- Migration 017 — corrige à nouveau les discussions privées (suite à la
-- migration 016, qui restait insuffisante) :
--
--  1. Le code choisi à la main (colonne private_code) n'est plus utilisé.
--     Une discussion privée est maintenant verrouillée par le code
--     personnel de la personne qui l'a créée (celui qu'elle utilise déjà
--     pour se connecter) — c'est CE code-là, et uniquement celui-là, qui
--     l'ouvre. Elle le communique elle-même à qui doit pouvoir lire le
--     fil ; si quelqu'un d'autre du même cercle essaie son propre code,
--     ça ne marche pas — c'est le but.
--  2. Corrige aussi un bug plus discret : le déverrouillage était mémorisé
--     par cercle (sessionStorage), pas par personne. Sur un appareil
--     partagé où plusieurs personnes du même cercle se connectent l'une
--     après l'autre dans le même onglet, la deuxième personne héritait
--     du déverrouillage de la première. Corrigé côté page
--     (assets/js/discussions.js) en incluant l'identifiant de la personne
--     dans la clé de stockage — rien à faire ici côté base.

alter table discussions add column if not exists owner_person_id uuid references people(id) on delete set null;
alter table discussions drop column if exists private_code;
