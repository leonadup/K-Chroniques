-- Jalons automatiques (Timeline) + Carte des lieux visités.
-- À exécuter une fois dans Supabase > SQL Editor (projet déjà existant).
--
-- Aucun changement RLS nécessaire : ces colonnes sont couvertes par les
-- policies déjà en place sur `entries` et `status_banner` (lecture publique
-- des lignes publiées / de la ligne unique, écriture réservée à Moi).

alter table status_banner add column if not exists depart_date date;

alter table entries add column if not exists lat numeric;
alter table entries add column if not exists lng numeric;
