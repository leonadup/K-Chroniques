-- Discussions (remplace la Boîte à questions par des fils multi-messages).
-- À exécuter une fois dans Supabase > SQL Editor (projet déjà existant).
--
-- La table "questions" reste en place, inutilisée : pas de migration
-- automatique des anciennes lignes (formes trop différentes, faible volume,
-- risque de mal migrer supérieur au bénéfice).

create table if not exists discussions (
  id uuid primary key default gen_random_uuid(),
  circle_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  -- true si le dernier message du fil est de Moi : évite d'avoir à
  -- re-joindre discussion_messages pour calculer le badge admin.
  last_message_is_moi boolean not null default false,
  -- rempli quand Moi ouvre le fil dans l'admin (marqueur "lu" admin ; côté
  -- visiteur c'est géré en localStorage, voir assets/js/discussions.js).
  last_seen_by_moi_at timestamptz
);

create index if not exists discussions_circle_idx on discussions (circle_id, last_message_at desc);

alter table discussions enable row level security;

create policy "discussions ouvrables par tous" on discussions for insert with check (true);
-- Lecture ouverte à tous : le cloisonnement par cercle est fait côté page
-- (comme pour entries/entry_photos, voir note de sécurité en haut de ce
-- fichier), pas en RLS.
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
-- Pas de update/delete public en v1 (non demandé).

-- Tient à jour discussions.last_message_at / last_message_is_moi à chaque
-- nouveau message (security definer, même principe que
-- reste_a_vivre_du_mois()) pour éviter d'ouvrir une policy update publique
-- sur "discussions".
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
