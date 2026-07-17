-- Permet d'archiver un fil de discussion (masqué par défaut, récupérable
-- depuis l'admin) en plus de pouvoir le supprimer définitivement.
-- À exécuter une fois dans Supabase > SQL Editor (projet déjà existant).

alter table discussions add column if not exists archived boolean not null default false;

-- Aucune policy de suppression n'existait encore sur ces deux tables (v1
-- volontairement fermée en écriture au-delà de l'insertion) : sans elle,
-- Supabase refuse toute suppression, y compris depuis le compte Moi.
create policy "discussions supprimables par Moi" on discussions
  for delete using (auth.role() = 'authenticated');
create policy "messages supprimables par Moi (suppression du fil)" on discussion_messages
  for delete using (auth.role() = 'authenticated');
