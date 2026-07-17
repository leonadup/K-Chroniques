-- Les K-Chroniques de Léona — schéma Supabase (version site statique HTML/CSS/JS)
-- À exécuter dans Supabase > SQL Editor (une seule fois, sur un projet neuf).
--
-- Le site est 100 % statique (pas de serveur) : le navigateur parle
-- directement à Supabase avec la clé "anon" (clé publique par design chez
-- Supabase, elle est faite pour être visible dans le code — voir
-- assets/js/supabase-client.js). La sécurité repose sur deux choses :
--
--  1. Un seul compte Supabase Auth ("Moi" / Léona) protège les écritures qui
--     comptent vraiment (récits, lettres, finances, bandeau) — voir README,
--     étape "Créer le compte Moi".
--  2. Le filtrage par cercle (qui voit quoi : Lettres, photos réservées...)
--     est fait par la page web elle-même, pas par la base. Quelqu'un de
--     très curieux avec les outils de développeur pourrait techniquement
--     lire des données réservées à un autre cercle. Accepté sciemment vu le
--     contexte (famille/amis proches, pas un site sensible).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Entrées (Récits & Lettres)
-- ---------------------------------------------------------------------------
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('recit', 'lettre')),
  title text not null,
  slug text not null unique,
  excerpt text,
  body text not null default '',
  entry_date date not null default current_date,
  location text,
  published boolean not null default false,
  -- cercles autorisés à voir l'entrée (indicatif — filtré côté page, voir
  -- note de sécurité en haut de fichier)
  visibility text[] not null default array['parents','famille','amis','copain'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- filet de sécurité : même en cas de bug côté page, une Lettre ne peut
  -- jamais être enregistrée comme visible par Famille/Amis
  constraint lettre_visibility_restreinte check (
    type <> 'lettre' or not (visibility && array['famille','amis']::text[])
  )
);

create index if not exists entries_type_idx on entries (type);
create index if not exists entries_date_idx on entries (entry_date desc);
create index if not exists entries_published_idx on entries (published);

alter table entries enable row level security;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists entries_set_updated_at on entries;
create trigger entries_set_updated_at
  before update on entries
  for each row execute function set_updated_at();

-- Tout le monde peut lire les entrées publiées ; Moi (connectée) voit aussi
-- les brouillons pour pouvoir les relire avant publication.
create policy "lecture publique des entrées publiées" on entries
  for select using (published = true or auth.role() = 'authenticated');

create policy "écriture réservée à Moi" on entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Photos d'une entrée (visibilité fine par photo — filtrée côté page)
-- ---------------------------------------------------------------------------
create table if not exists entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  -- null = hérite de la visibilité de l'entrée ; sinon restreint davantage
  visibility text[],
  created_at timestamptz not null default now()
);

create index if not exists entry_photos_entry_idx on entry_photos (entry_id, sort_order);

alter table entry_photos enable row level security;

create policy "lecture publique des photos" on entry_photos for select using (true);
create policy "écriture des photos réservée à Moi" on entry_photos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Réactions emoji (une par cercle+emoji+entrée, le compte s'obtient par group by)
-- ---------------------------------------------------------------------------
create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  circle_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (entry_id, circle_id, emoji)
);

create index if not exists reactions_entry_idx on reactions (entry_id);

alter table reactions enable row level security;

create policy "réactions ouvertes en lecture" on reactions for select using (true);
create policy "réactions ouvertes en écriture" on reactions for insert with check (true);
create policy "réactions supprimables (toggle)" on reactions for delete using (true);

-- ---------------------------------------------------------------------------
-- Commentaires
-- ---------------------------------------------------------------------------
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  circle_id text not null,
  author_name text not null,
  body text not null,
  reply_text text,
  created_at timestamptz not null default now()
);

create index if not exists comments_entry_idx on comments (entry_id, created_at);

alter table comments enable row level security;

create policy "commentaires ouverts en lecture" on comments for select using (true);
create policy "commentaires ouverts en écriture" on comments for insert with check (true);
create policy "suppression des commentaires réservée à Moi" on comments
  for delete using (auth.role() = 'authenticated');
create policy "réponse aux commentaires réservée à Moi" on comments
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Bandeau "où j'en suis" — une seule ligne, toujours id = true
-- ---------------------------------------------------------------------------
create table if not exists status_banner (
  id boolean primary key default true check (id),
  city text,
  status_note text,
  music_title text,
  music_url text,
  note text,
  updated_at timestamptz not null default now()
);

insert into status_banner (id) values (true) on conflict (id) do nothing;

alter table status_banner enable row level security;

create policy "bandeau lisible par tous" on status_banner for select using (true);
create policy "bandeau modifiable par Moi" on status_banner
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Boîte à questions
-- ---------------------------------------------------------------------------
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  circle_id text not null,
  author_name text,
  question_text text not null,
  status text not null default 'pending' check (status in ('pending', 'answered')),
  answered_entry_id uuid references entries(id) on delete set null,
  reply_text text,
  created_at timestamptz not null default now()
);

create index if not exists questions_status_idx on questions (status);

alter table questions enable row level security;

create policy "questions posables par tous" on questions for insert with check (true);
create policy "questions lisibles par Moi" on questions
  for select using (auth.role() = 'authenticated');
-- une question à laquelle Moi a répondu directement (reply_text) redevient
-- lisible par tout le monde : c'est ce qui permet à la personne qui l'a
-- posée (ou n'importe qui du même cercle) de revenir voir la réponse.
create policy "questions avec réponse lisibles par tous" on questions
  for select using (reply_text is not null);
create policy "questions modifiables par Moi" on questions
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Finances (Moi uniquement — même le détail n'est jamais lu par le public,
-- seul le "reste à vivre" du mois passe par la fonction ci-dessous)
-- ---------------------------------------------------------------------------
create table if not exists budget_targets (
  category text primary key,
  target_amount numeric(10,2) not null default 0
);

insert into budget_targets (category, target_amount) values
  ('logement', 315),
  ('charges', 65),
  ('nourriture', 175),
  ('transport', 50),
  ('telephone', 20),
  ('loisirs', 120),
  ('shopping', 50),
  ('sante', 25),
  ('imprevus', 80)
on conflict (category) do nothing;

alter table budget_targets enable row level security;
create policy "budget réservé à Moi" on budget_targets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  amount numeric(10,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on expenses (expense_date desc);

alter table expenses enable row level security;
create policy "dépenses réservées à Moi" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists incomes (
  id uuid primary key default gen_random_uuid(),
  income_date date not null,
  source text not null,
  amount numeric(10,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists incomes_date_idx on incomes (income_date desc);

alter table incomes enable row level security;
create policy "revenus réservés à Moi" on incomes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Résumé ultra-simplifié partagé avec le cercle Parents : uniquement le
-- reste à vivre du mois en cours, jamais le détail par catégorie. La
-- fonction tourne avec les droits du propriétaire (security definer), donc
-- elle peut lire expenses/incomes même si l'appelant (n'importe qui côté
-- public) n'a pas accès à ces tables.
create or replace function reste_a_vivre_du_mois()
returns numeric
language sql
security definer
set search_path = public
as $$
  select
    (select coalesce(sum(amount), 0) from incomes
      where income_date >= date_trunc('month', now())::date
        and income_date < (date_trunc('month', now()) + interval '1 month')::date)
    -
    (select coalesce(sum(amount), 0) from expenses
      where expense_date >= date_trunc('month', now())::date
        and expense_date < (date_trunc('month', now()) + interval '1 month')::date);
$$;

grant execute on function reste_a_vivre_du_mois() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage : crée un bucket PUBLIC nommé "photos" depuis le tableau de bord
-- Supabase (Storage > New bucket > Public bucket = ON). Les policies
-- ci-dessous restreignent l'upload à Moi tout en laissant la lecture
-- publique (nécessaire pour afficher les photos avec une simple <img src>,
-- sans URL signée).
-- ---------------------------------------------------------------------------
create policy "upload des photos réservé à Moi"
  on storage.objects for insert
  with check (bucket_id = 'photos' and auth.role() = 'authenticated');

create policy "suppression des photos réservée à Moi"
  on storage.objects for delete
  using (bucket_id = 'photos' and auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Migration 001 — jalons automatiques (Timeline) + carte des lieux visités
-- (voir supabase/migrations/001_jalons_et_carte.sql pour un projet existant)
-- ---------------------------------------------------------------------------
alter table status_banner add column if not exists depart_date date;

alter table entries add column if not exists lat numeric;
alter table entries add column if not exists lng numeric;
