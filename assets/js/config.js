// Renseigne ces deux valeurs après avoir créé ton projet Supabase
// (Project Settings > API). La clé "anon" est faite pour être publique —
// c'est la clé standard côté navigateur chez Supabase, protégée par les
// règles RLS définies dans supabase/schema.sql, pas un secret à cacher.
export const SUPABASE_URL = 'https://iglwwrfhfvzxifjbyusa.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_OWoN-xq1Z_wnCl8dQx_0qQ_C_E0LQ0k';

// Les codes d'accès des cercles non-admin ne sont plus ici : chaque
// personne a désormais son propre code, géré depuis moi.html → onglet
// Personnes (table `people`, voir supabase/migrations/014_personnes.sql).

// Clé publique VAPID pour les notifications push (voir README, section
// "Notifications push"). Comme la clé anon Supabase, c'est fait pour être
// publique — c'est la clé PRIVÉE (jamais mise ici) qui doit rester secrète,
// côté Edge Function uniquement.
export const VAPID_PUBLIC_KEY = 'BLy5SYClFFRySB1G6W8n0UtbFPpn5y8HVY783lYldl4OPt3QQSfEbS0uVC75AB2x3A00H2qQh092-7pKOD3NIIQ';
