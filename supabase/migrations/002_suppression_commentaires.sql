-- Permet à l'auteur d'un commentaire de le supprimer lui-même (pour se
-- corriger et recommencer), sur le même principe déjà accepté pour les
-- réactions (suppression ouverte à tous — pas de vraie identité par
-- cercle, voir la note de sécurité en haut de schema.sql). Le filtrage
-- "c'est bien mon commentaire" se fait côté navigateur (assets/js/utils.js
-- + assets/js/cercle-page.js), pas en base : quelqu'un de très curieux
-- pourrait techniquement supprimer un commentaire qui n'est pas le sien.
-- À exécuter une fois dans Supabase > SQL Editor (projet déjà existant).

create policy "commentaires supprimables par tous (auteur)" on comments for delete using (true);
