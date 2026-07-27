-- Migration 013 — Capsules temporelles (espace perso de Moi).
--
-- Plusieurs capsules possibles, chacune avec sa propre date de déblocage.
-- Strictement privé, jamais exposé aux cercles — même RLS que
-- journal_entries/wishlist_items (migration 007). La photo éventuelle est
-- stockée dans le bucket "photos" existant, sous un préfixe capsules/.
create table if not exists time_capsules (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null,
  unlock_date date not null,
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists time_capsules_unlock_idx on time_capsules (unlock_date);

alter table time_capsules enable row level security;
create policy "capsules réservées à Moi" on time_capsules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
