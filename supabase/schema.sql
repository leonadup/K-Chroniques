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

-- ---------------------------------------------------------------------------
-- Migration 002 — un commentaire peut être supprimé par son auteur
-- (voir supabase/migrations/002_suppression_commentaires.sql)
-- ---------------------------------------------------------------------------
create policy "commentaires supprimables par tous (auteur)" on comments for delete using (true);

-- ---------------------------------------------------------------------------
-- Migration 003 — Discussions (remplace la Boîte à questions)
-- (voir supabase/migrations/003_discussions.sql)
-- ---------------------------------------------------------------------------
create table if not exists discussions (
  id uuid primary key default gen_random_uuid(),
  circle_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_is_moi boolean not null default false,
  last_seen_by_moi_at timestamptz
);

create index if not exists discussions_circle_idx on discussions (circle_id, last_message_at desc);

alter table discussions enable row level security;

create policy "discussions ouvrables par tous" on discussions for insert with check (true);
create policy "discussions lisibles par tous" on discussions for select using (true);
create policy "discussions modifiables par Moi" on discussions
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists discussion_messages (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references discussions(id) on delete cascade,
  author_name text not null,
  body text not null,
  is_moi boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists discussion_messages_thread_idx on discussion_messages (discussion_id, created_at);

alter table discussion_messages enable row level security;

create policy "messages postables par tous" on discussion_messages for insert with check (true);
create policy "messages lisibles par tous" on discussion_messages for select using (true);

create or replace function touch_discussion_on_new_message()
returns trigger as $$
begin
  update discussions
    set last_message_at = new.created_at, last_message_is_moi = new.is_moi
    where id = new.discussion_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists discussion_messages_touch_parent on discussion_messages;
create trigger discussion_messages_touch_parent
  after insert on discussion_messages
  for each row execute function touch_discussion_on_new_message();

-- ---------------------------------------------------------------------------
-- Migration 004 — un fil de discussion peut être archivé ou supprimé
-- (voir supabase/migrations/004_discussions_archive.sql)
-- ---------------------------------------------------------------------------
alter table discussions add column if not exists archived boolean not null default false;

create policy "discussions supprimables par Moi" on discussions
  for delete using (auth.role() = 'authenticated');
create policy "messages supprimables par Moi (suppression du fil)" on discussion_messages
  for delete using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Migration 005 — Notifications push (site installable + notif à chaque
-- récit/lettre publié) — voir supabase/migrations/005_push_subscriptions.sql
-- ---------------------------------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  circle_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_circle_idx on push_subscriptions (circle_id);

alter table push_subscriptions enable row level security;

create policy "abonnement aux notifs ouvert en écriture" on push_subscriptions for insert with check (true);
create policy "abonnement aux notifs modifiable (upsert par endpoint)" on push_subscriptions for update using (true) with check (true);
create policy "désabonnement possible par tous" on push_subscriptions for delete using (true);
create policy "abonnements lisibles par Moi" on push_subscriptions for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Migration 006 — Onglet Coréen (espace strictement personnel, jamais
-- exposé aux cercles) — voir supabase/migrations/006_coreen.sql
-- ---------------------------------------------------------------------------
create table if not exists coreen_units (
  id text primary key,
  title text not null,
  icon text,
  sort_order int not null default 0
);

create table if not exists coreen_items (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references coreen_units(id) on delete cascade,
  korean text not null,
  romanization text,
  french text not null,
  note text,
  sort_order int not null default 0,
  unique (unit_id, sort_order)
);

create index if not exists coreen_items_unit_idx on coreen_items (unit_id, sort_order);

create table if not exists coreen_progress (
  item_id uuid primary key references coreen_items(id) on delete cascade,
  box int not null default 1,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  next_review_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists coreen_stats (
  id boolean primary key default true check (id),
  xp int not null default 0,
  streak_days int not null default 0,
  last_practice_date date,
  updated_at timestamptz not null default now()
);

insert into coreen_stats (id) values (true) on conflict (id) do nothing;

alter table coreen_units enable row level security;
alter table coreen_items enable row level security;
alter table coreen_progress enable row level security;
alter table coreen_stats enable row level security;

create policy "coréen réservé à Moi (unités)" on coreen_units
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "coréen réservé à Moi (items)" on coreen_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "coréen réservé à Moi (progression)" on coreen_progress
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "coréen réservé à Moi (stats)" on coreen_stats
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into coreen_units (id, title, icon, sort_order) values
  ('hangul-voyelles', 'Hangul — Voyelles', '🔤', 1),
  ('hangul-consonnes', 'Hangul — Consonnes', '🔡', 2),
  ('salutations', 'Salutations & politesse', '👋', 3),
  ('nombres-sino', 'Nombres (sino-coréens)', '🔢', 4),
  ('nombres-natifs', 'Nombres (natifs)', '🔟', 5),
  ('nourriture', 'Nourriture & restaurant', '🍚', 6),
  ('transport-ville', 'Transport & ville', '🚇', 7),
  ('quotidien-pvt', 'Expressions utiles au quotidien', '💬', 8),
  ('temps-dates', 'Temps & jours de la semaine', '📅', 9)
on conflict (id) do nothing;

insert into coreen_items (unit_id, korean, romanization, french, note, sort_order) values
  ('hangul-voyelles', 'ㅏ', 'a', '"a" (comme dans "papa")', null, 1),
  ('hangul-voyelles', 'ㅑ', 'ya', '"ya"', null, 2),
  ('hangul-voyelles', 'ㅓ', 'eo', '"eo" (un "o" ouvert)', null, 3),
  ('hangul-voyelles', 'ㅕ', 'yeo', '"yeo"', null, 4),
  ('hangul-voyelles', 'ㅗ', 'o', '"o"', null, 5),
  ('hangul-voyelles', 'ㅛ', 'yo', '"yo"', null, 6),
  ('hangul-voyelles', 'ㅜ', 'u', '"ou"', null, 7),
  ('hangul-voyelles', 'ㅠ', 'yu', '"you"', null, 8),
  ('hangul-voyelles', 'ㅡ', 'eu', '"eu" (bref, lèvres tirées)', null, 9),
  ('hangul-voyelles', 'ㅣ', 'i', '"i"', null, 10),

  ('hangul-consonnes', 'ㄱ', 'g/k', '"g" ou "k" selon la position', null, 1),
  ('hangul-consonnes', 'ㄴ', 'n', '"n"', null, 2),
  ('hangul-consonnes', 'ㄷ', 'd/t', '"d" ou "t" selon la position', null, 3),
  ('hangul-consonnes', 'ㄹ', 'r/l', '"r" ou "l" selon la position', null, 4),
  ('hangul-consonnes', 'ㅁ', 'm', '"m"', null, 5),
  ('hangul-consonnes', 'ㅂ', 'b/p', '"b" ou "p" selon la position', null, 6),
  ('hangul-consonnes', 'ㅅ', 's', '"s"', null, 7),
  ('hangul-consonnes', 'ㅇ', 'ng', 'muette en début de syllabe, "ng" en fin', null, 8),
  ('hangul-consonnes', 'ㅈ', 'j', '"j"', null, 9),
  ('hangul-consonnes', 'ㅊ', 'ch', '"ch" (aspiré)', null, 10),
  ('hangul-consonnes', 'ㅋ', 'k', '"k" (aspiré)', null, 11),
  ('hangul-consonnes', 'ㅌ', 't', '"t" (aspiré)', null, 12),
  ('hangul-consonnes', 'ㅍ', 'p', '"p" (aspiré)', null, 13),
  ('hangul-consonnes', 'ㅎ', 'h', '"h"', null, 14),

  ('salutations', '안녕하세요', 'annyeonghaseyo', 'Bonjour', 'poli, standard', 1),
  ('salutations', '안녕히 가세요', 'annyeonghi gaseyo', 'Au revoir (à qui part)', 'dit par la personne qui reste', 2),
  ('salutations', '안녕히 계세요', 'annyeonghi gyeseyo', 'Au revoir (à qui reste)', 'dit par la personne qui part', 3),
  ('salutations', '감사합니다', 'gamsahamnida', 'Merci', 'très formel', 4),
  ('salutations', '고맙습니다', 'gomapseumnida', 'Merci', null, 5),
  ('salutations', '죄송합니다', 'joesonghamnida', 'Je suis désolé(e)', 'formel', 6),
  ('salutations', '미안해요', 'mianhaeyo', 'Désolé(e)', null, 7),
  ('salutations', '네', 'ne', 'Oui', null, 8),
  ('salutations', '아니요', 'aniyo', 'Non', null, 9),
  ('salutations', '저기요', 'jeogiyo', 'Excusez-moi', 'pour interpeller quelqu''un', 10),
  ('salutations', '이름이 뭐예요', 'ireumi mwoyeyo', 'Comment tu t''appelles ?', null, 11),
  ('salutations', '만나서 반가워요', 'mannaseo bangawoyo', 'Ravi(e) de te rencontrer', null, 12),

  ('nombres-sino', '일', 'il', '1', 'dates, argent, numéros', 1),
  ('nombres-sino', '이', 'i', '2', null, 2),
  ('nombres-sino', '삼', 'sam', '3', null, 3),
  ('nombres-sino', '사', 'sa', '4', null, 4),
  ('nombres-sino', '오', 'o', '5', null, 5),
  ('nombres-sino', '육', 'yuk', '6', null, 6),
  ('nombres-sino', '칠', 'chil', '7', null, 7),
  ('nombres-sino', '팔', 'pal', '8', null, 8),
  ('nombres-sino', '구', 'gu', '9', null, 9),
  ('nombres-sino', '십', 'sip', '10', null, 10),

  ('nombres-natifs', '하나', 'hana', '1', 'objets, âge, heures', 1),
  ('nombres-natifs', '둘', 'dul', '2', null, 2),
  ('nombres-natifs', '셋', 'set', '3', null, 3),
  ('nombres-natifs', '넷', 'net', '4', null, 4),
  ('nombres-natifs', '다섯', 'daseot', '5', null, 5),
  ('nombres-natifs', '여섯', 'yeoseot', '6', null, 6),
  ('nombres-natifs', '일곱', 'ilgop', '7', null, 7),
  ('nombres-natifs', '여덟', 'yeodeol', '8', null, 8),
  ('nombres-natifs', '아홉', 'ahop', '9', null, 9),
  ('nombres-natifs', '열', 'yeol', '10', null, 10),

  ('nourriture', '밥', 'bap', 'Riz / repas', null, 1),
  ('nourriture', '물', 'mul', 'Eau', null, 2),
  ('nourriture', '김치', 'gimchi', 'Kimchi', null, 3),
  ('nourriture', '고기', 'gogi', 'Viande', null, 4),
  ('nourriture', '커피', 'keopi', 'Café', null, 5),
  ('nourriture', '맛있어요', 'masisseoyo', 'C''est délicieux', null, 6),
  ('nourriture', '배고파요', 'baegopayo', 'J''ai faim', null, 7),
  ('nourriture', '계산서 주세요', 'gyesanseo juseyo', 'L''addition s''il vous plaît', null, 8),
  ('nourriture', '메뉴', 'menyu', 'Menu', null, 9),
  ('nourriture', '소주', 'soju', 'Soju', null, 10),

  ('transport-ville', '지하철', 'jihacheol', 'Métro', null, 1),
  ('transport-ville', '버스', 'beoseu', 'Bus', null, 2),
  ('transport-ville', '택시', 'taeksi', 'Taxi', null, 3),
  ('transport-ville', '편의점', 'pyeonuijeom', 'Supérette (konbini)', null, 4),
  ('transport-ville', '화장실', 'hwajangsil', 'Toilettes', null, 5),
  ('transport-ville', '어디예요', 'eodiyeyo', 'Où est-ce ?', null, 6),
  ('transport-ville', '얼마예요', 'eolmayeyo', 'Combien ça coûte ?', null, 7),
  ('transport-ville', '여기요', 'yeogiyo', 'Tenez / Par ici', 'pour appeler quelqu''un', 8),
  ('transport-ville', '오른쪽', 'oreunjjok', 'À droite', null, 9),
  ('transport-ville', '왼쪽', 'oenjjok', 'À gauche', null, 10),

  ('quotidien-pvt', '도와주세요', 'dowajuseyo', 'Aidez-moi s''il vous plaît', null, 1),
  ('quotidien-pvt', '천천히 말해 주세요', 'cheoncheonhi malhae juseyo', 'Parlez plus lentement s''il vous plaît', null, 2),
  ('quotidien-pvt', '이해 못해요', 'ihae mothaeyo', 'Je ne comprends pas', null, 3),
  ('quotidien-pvt', '한국어를 조금 해요', 'hangugeoreul jogeum haeyo', 'Je parle un peu coréen', null, 4),
  ('quotidien-pvt', '잠깐만요', 'jamkkanmanyo', 'Un instant s''il vous plaît', null, 5),
  ('quotidien-pvt', '괜찮아요', 'gwaenchanayo', 'Ça va / Pas de souci', null, 6),
  ('quotidien-pvt', '정말요', 'jeongmallyo', 'Vraiment ?', null, 7),
  ('quotidien-pvt', '화이팅', 'hwaiting', 'Bon courage !', 'emprunté à l''anglais "fighting"', 8),

  ('temps-dates', '오늘', 'oneul', 'Aujourd''hui', null, 1),
  ('temps-dates', '내일', 'naeil', 'Demain', null, 2),
  ('temps-dates', '어제', 'eoje', 'Hier', null, 3),
  ('temps-dates', '지금', 'jigeum', 'Maintenant', null, 4),
  ('temps-dates', '아침', 'achim', 'Matin', null, 5),
  ('temps-dates', '저녁', 'jeonyeok', 'Soir', null, 6),
  ('temps-dates', '월요일', 'woryoil', 'Lundi', null, 7),
  ('temps-dates', '화요일', 'hwayoil', 'Mardi', null, 8),
  ('temps-dates', '수요일', 'suyoil', 'Mercredi', null, 9),
  ('temps-dates', '목요일', 'mogyoil', 'Jeudi', null, 10),
  ('temps-dates', '금요일', 'geumyoil', 'Vendredi', null, 11),
  ('temps-dates', '토요일', 'toyoil', 'Samedi', null, 12),
  ('temps-dates', '일요일', 'iryoil', 'Dimanche', null, 13)
on conflict (unit_id, sort_order) do nothing;
