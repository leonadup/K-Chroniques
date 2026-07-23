-- Migration 009 — Réapplique les politiques RLS de push_subscriptions.
--
-- Constaté en prod : l'inscription aux notifs échouait avec "new row
-- violates row-level security policy for table push_subscriptions", ce qui
-- n'arrive que si RLS est activé sur la table sans politique INSERT
-- correspondante en place. Ce script recrée les politiques attendues
-- (voir migrations/005_push_subscriptions.sql) de façon idempotente, sans
-- se soucier de leur état actuel.

alter table push_subscriptions enable row level security;

drop policy if exists "abonnement aux notifs ouvert en écriture" on push_subscriptions;
create policy "abonnement aux notifs ouvert en écriture" on push_subscriptions
  for insert with check (true);

drop policy if exists "abonnement aux notifs modifiable (upsert par endpoint)" on push_subscriptions;
create policy "abonnement aux notifs modifiable (upsert par endpoint)" on push_subscriptions
  for update using (true) with check (true);

drop policy if exists "désabonnement possible par tous" on push_subscriptions;
create policy "désabonnement possible par tous" on push_subscriptions
  for delete using (true);

drop policy if exists "abonnements lisibles par Moi" on push_subscriptions;
create policy "abonnements lisibles par Moi" on push_subscriptions
  for select using (auth.role() = 'authenticated');
