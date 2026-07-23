-- Migration 011 — Suivi "lu par Moi" des commentaires, pour :
--  1. le badge rouge sur les onglets Récits/Lettres (nombre d'entrées avec
--     des commentaires non encore vus),
--  2. la notif push à Moi quand un cercle commente (voir la fonction Edge
--     notify-comment) — regroupée par (entrée, cercle) : un seul push tant
--     que Léona n'a pas rouvert l'entrée, pour ne pas la submerger si
--     plusieurs commentaires arrivent avant qu'elle ne regarde.
--
-- Le backfill à `true` évite qu'une mise à jour ne fasse soudainement
-- apparaître comme "non lu" tout l'historique existant.
alter table comments add column if not exists seen_by_moi boolean not null default false;
update comments set seen_by_moi = true where seen_by_moi = false;
