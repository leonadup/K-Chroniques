-- Migration 014 — Comptes personnels par personne (remplace les codes
-- partagés par cercle de assets/js/config.js).
--
-- Chaque personne (Papa, Maman, Papy, Mamie, Tante, chaque ami...) a
-- désormais son propre code, rattaché à l'un des 4 groupes de visibilité
-- existants (parents/famille/amis/copain — inchangés, voir circles.js).
-- Gérée depuis moi.html → onglet Personnes (assets/js/admin-people.js).
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  circle_id text not null,
  name text not null,
  access_code text not null unique,
  created_at timestamptz not null default now()
);

alter table people enable row level security;
create policy "personnes réservées à Moi" on people
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Vérification de code depuis acceder.html (client anonyme, pas de session
-- Supabase Auth) : une fonction security definer qui ne renvoie QUE la
-- ligne correspondante, jamais toute la table — contrairement aux anciens
-- codes de cercle qui étaient visibles en clair dans config.js, personne
-- ne peut récupérer la liste complète des codes via cette fonction.
create or replace function check_person_code(p_code text)
returns table(id uuid, circle_id text, name text)
language sql
security definer
set search_path = public
as $$
  select id, circle_id, name from people where access_code = p_code;
$$;

grant execute on function check_person_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Réactions : attribution par personne (au lieu d'une seule réaction
-- partagée par cercle et par emoji). Les anciennes lignes gardent
-- person_id = NULL ; Postgres traite chaque NULL comme distinct dans une
-- contrainte unique, donc pas de conflit avec l'historique.
-- ---------------------------------------------------------------------------
alter table reactions add column if not exists person_id uuid references people(id) on delete set null;
alter table reactions add column if not exists person_name text;
alter table reactions drop constraint if exists reactions_entry_id_circle_id_emoji_key;
alter table reactions add constraint reactions_entry_id_person_id_emoji_key unique (entry_id, person_id, emoji);

-- ---------------------------------------------------------------------------
-- Quiz coréen : une ligne par manche jouée, pour afficher les derniers
-- résultats par personne (voir assets/js/quiz-coreen.js). Toujours aucune
-- progression/compétition suivie dans le temps, juste un journal des
-- dernières manches, visible de tous les cercles.
-- ---------------------------------------------------------------------------
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete set null,
  person_name text not null,
  correct_count int not null,
  total int not null,
  created_at timestamptz not null default now()
);

alter table quiz_attempts enable row level security;
create policy "tentatives de quiz lisibles par tous" on quiz_attempts for select using (true);
create policy "tentatives de quiz écrites par tous" on quiz_attempts for insert with check (true);
create policy "tentatives de quiz supprimables par Moi" on quiz_attempts
  for delete using (auth.role() = 'authenticated');
