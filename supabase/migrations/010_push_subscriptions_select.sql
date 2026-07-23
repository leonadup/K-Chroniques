-- Migration 010 — Corrige l'inscription aux notifs push, cassée par la
-- politique de lecture de push_subscriptions.
--
-- Constaté en prod : "new row violates row-level security policy for table
-- push_subscriptions" à l'inscription (upsert), alors que la politique
-- INSERT est bien ouverte (with check (true)). Cause réelle : Postgres a
-- besoin de relire la ligne qu'il vient d'écrire pour finaliser un upsert,
-- et la politique SELECT était réservée à "Moi" (auth.role() =
-- 'authenticated') — un navigateur de cercle (jamais connecté en tant que
-- Moi) ne pouvait donc jamais "revoir" sa propre inscription, et Postgres
-- rapporte ça comme une violation RLS côté écriture.
--
-- Sans risque à ouvrir : insert/update/delete sont déjà ouverts à tous sur
-- cette table (voir 005_push_subscriptions.sql) — un endpoint + clés
-- publiques de notif est inexploitable sans la clé VAPID privée, connue
-- uniquement de la fonction Edge (secrets Supabase).
drop policy if exists "abonnements lisibles par Moi" on push_subscriptions;
create policy "abonnements lisibles par tous (nécessaire à l'upsert)" on push_subscriptions
  for select using (true);
