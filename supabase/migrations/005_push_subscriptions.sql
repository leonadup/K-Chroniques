-- Migration 005 — Notifications push (installation du site façon appli +
-- notif à chaque nouveau récit/lettre publié). Voir README pour la mise en
-- place complète (clés VAPID, Edge Function, Database Webhook).

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

-- Même logique que les autres tables ouvertes au public (réactions,
-- commentaires...) : l'abonnement aux notifs n'est pas une donnée sensible,
-- n'importe qui peut s'abonner/se désabonner depuis son propre appareil.
create policy "abonnement aux notifs ouvert en écriture" on push_subscriptions for insert with check (true);
create policy "abonnement aux notifs modifiable (upsert par endpoint)" on push_subscriptions for update using (true) with check (true);
create policy "désabonnement possible par tous" on push_subscriptions for delete using (true);
-- La lecture reste réservée à Moi : c'est l'Edge Function d'envoi qui lit
-- la liste des endpoints, avec la clé service_role (qui contourne RLS), pas
-- le navigateur d'un proche.
create policy "abonnements lisibles par Moi" on push_subscriptions for select using (auth.role() = 'authenticated');
