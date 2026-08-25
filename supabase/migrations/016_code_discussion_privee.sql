-- Migration 016 — corrige les discussions privées : jusqu'ici le
-- déverrouillage acceptait le code personnel de N'IMPORTE QUELLE personne
-- active (via check_person_code), donc n'importe qui connaissant un code
-- de la famille pouvait ouvrir n'importe quelle discussion privée du
-- cercle. Chaque discussion privée a maintenant son propre code, choisi
-- par la personne qui la crée, à communiquer elle-même à qui doit pouvoir
-- la lire. Léona (Moi) continue de tout voir sans code, comme avant (voir
-- admin-discussions.js).

alter table discussions add column if not exists private_code text;
