// Renseigne ces deux valeurs après avoir créé ton projet Supabase
// (Project Settings > API). La clé "anon" est faite pour être publique —
// c'est la clé standard côté navigateur chez Supabase, protégée par les
// règles RLS définies dans supabase/schema.sql, pas un secret à cacher.
export const SUPABASE_URL = 'https://iglwwrfhfvzxifjbyusa.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_OWoN-xq1Z_wnCl8dQx_0qQ_C_E0LQ0k';

// Codes d'accès des 4 cercles non-admin (Moi se connecte séparément avec un
// vrai compte, voir moi.html). Change ces valeurs avant de partager les
// liens à qui que ce soit.
//
// Important : ce n'est PAS un mécanisme de sécurité réel. Le code est
// présent dans le code source de cette page, donc visible par quiconque
// saurait où regarder. C'est un filtre pour que chacun tombe sur l'espace
// qui le concerne, pas un verrou — voir la note en haut de schema.sql.
export const ACCESS_CODES = {
  parents: 'JeVousAimeF0RT!',
  famille: 'bienvenue',
  amis: 'bienvenue',
  copain: 'mondidouchatalacremedeNOISETTE<3'
};
