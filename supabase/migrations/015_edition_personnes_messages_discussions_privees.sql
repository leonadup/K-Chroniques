-- Migration 015 — quatre demandes de Léona :
--  1. Pouvoir modifier une personne (nom / code / groupe / statut actif)
--     depuis l'admin, au lieu de devoir la supprimer puis la recréer.
--  2. Pouvoir modifier/supprimer un message précis dans une discussion
--     (jusqu'ici on ne pouvait qu'archiver/supprimer le fil entier).
--  3. Discussions privées : un fil peut être marqué privé à sa création ;
--     son titre reste alors caché aux autres personnes du cercle tant
--     qu'elles n'ont pas saisi un code personnel valide (vérifié côté page
--     avec la fonction check_person_code déjà existante).
--  4. Pouvoir corriger un commentaire déjà envoyé sous un récit/une lettre
--     (jusqu'ici seule la suppression était possible, voir migration 002).
--
-- Comme le reste du schéma (voir la note de sécurité en tête de
-- schema.sql), ces contrôles sont appliqués côté page : les personnes
-- n'ayant pas de vraie session Supabase Auth, les policies ci-dessous
-- restent ouvertes (using (true)) et suivent le même modèle de confiance
-- que "commentaires supprimables par tous (auteur)" (migration 002).

-- ---------------------------------------------------------------------------
-- 1. Statut actif/bloqué d'une personne
-- ---------------------------------------------------------------------------
alter table people add column if not exists active boolean not null default true;

create or replace function check_person_code(p_code text)
returns table(id uuid, circle_id text, name text)
language sql
security definer
set search_path = public
as $$
  select id, circle_id, name from people where access_code = p_code and active = true;
$$;

-- ---------------------------------------------------------------------------
-- 2. Édition/suppression d'un message précis dans une discussion
-- ---------------------------------------------------------------------------
alter table discussion_messages add column if not exists author_person_id uuid references people(id) on delete set null;

drop policy if exists "messages modifiables par tous (auteur)" on discussion_messages;
create policy "messages modifiables par tous (auteur)" on discussion_messages
  for update using (true) with check (true);

drop policy if exists "messages supprimables par tous (auteur)" on discussion_messages;
create policy "messages supprimables par tous (auteur)" on discussion_messages
  for delete using (true);

-- ---------------------------------------------------------------------------
-- 3. Discussions privées (masquées pour le cercle tant que non déverrouillées)
-- ---------------------------------------------------------------------------
alter table discussions add column if not exists is_private boolean not null default false;

-- ---------------------------------------------------------------------------
-- 4. Édition d'un commentaire par son auteur (la suppression était déjà
--    ouverte par la migration 002 — "commentaires supprimables par tous").
--    reply_text (la réponse de Léona) reste modifiable par ce même canal
--    ouvert, cohérent avec le modèle de confiance déjà accepté ci-dessus.
-- ---------------------------------------------------------------------------
drop policy if exists "commentaires modifiables par tous (auteur)" on comments;
create policy "commentaires modifiables par tous (auteur)" on comments
  for update using (true) with check (true);
