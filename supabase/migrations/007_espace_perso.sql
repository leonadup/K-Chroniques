-- Migration 007 — Espace perso de Moi : Journal privé, Checklist PVT (avec
-- rappels), Fiche d'urgence, Liste d'envies, Bloc-notes. Comme l'onglet
-- Coréen (migration 006), rien ici n'est jamais visible des cercles.

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  mood text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists journal_entries_date_idx on journal_entries (entry_date desc, created_at desc);
alter table journal_entries enable row level security;
create policy "journal réservé à Moi" on journal_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  note text,
  category text,
  done boolean not null default false,
  done_at timestamptz,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table checklist_items enable row level security;
create policy "checklist réservée à Moi" on checklist_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists emergency_info (
  id boolean primary key default true check (id),
  contact_france_name text,
  contact_france_phone text,
  insurance_name text,
  insurance_policy_number text,
  insurance_phone text,
  embassy_phone text,
  embassy_address text,
  home_address_korea text,
  blood_type text,
  allergies text,
  medical_notes text,
  updated_at timestamptz not null default now()
);
insert into emergency_info (id) values (true) on conflict (id) do nothing;
alter table emergency_info enable row level security;
create policy "fiche urgence réservée à Moi" on emergency_info
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  note text,
  lat numeric,
  lng numeric,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table wishlist_items enable row level security;
create policy "envies réservées à Moi" on wishlist_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists quick_notes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  created_at timestamptz not null default now()
);
alter table quick_notes enable row level security;
create policy "notes réservées à Moi" on quick_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Contenu de départ : checklist PVT. Écris-la à ton rythme, supprime ce qui
-- ne s'applique pas, ajoute le reste depuis l'onglet Checklist. Les règles
-- administratives coréennes changent parfois : vérifie les points marqués
-- d'une note sur les sites officiels avant de cocher.
-- ---------------------------------------------------------------------------
insert into checklist_items (title, note, category) values
  ('Faire la demande de visa PVT', 'Vérifie les conditions à jour sur le site officiel avant de déposer le dossier.', 'avant-depart'),
  ('Réserver le billet d''avion', null, 'avant-depart'),
  ('Souscrire une assurance voyage/santé', 'Obligatoire pour le visa PVT — garde une preuve imprimée pour la douane.', 'avant-depart'),
  ('Trouver un premier logement', 'Au moins pour les 2-3 premières semaines, le temps de visiter sur place.', 'avant-depart'),
  ('Prévenir la banque en France du départ', 'Vérifie que la carte fonctionne à l''international sans frais cachés.', 'avant-depart'),
  ('Récupérer/valider le visa à l''arrivée', null, 'arrivee'),
  ('Acheter une carte SIM ou un forfait coréen', null, 'arrivee'),
  ('Faire une carte de transport T-money', null, 'arrivee'),
  ('S''enregistrer pour la carte de résident étranger (ARC)', 'Délai légal après l''arrivée à vérifier — confirme sur le site officiel de l''immigration coréenne.', 'installation'),
  ('Ouvrir un compte bancaire coréen', 'Nécessite généralement l''ARC.', 'installation'),
  ('Enregistrer son adresse locale', null, 'installation')
on conflict (title) do nothing;
