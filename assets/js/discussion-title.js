// Titre auto-généré à partir du premier message d'un nouveau fil de
// discussion. Heuristique volontairement simple (pas d'IA, pas d'appel
// réseau) : le site est 100% statique et ne peut pas cacher une clé d'API
// privée côté navigateur (voir la note de sécurité en haut de
// supabase/schema.sql). Le résultat peut être corrigé à la main depuis
// l'admin (discussions.title est un champ éditable).

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'd', 'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', 'cet', 'cette', 'ces',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'que', 'qui', 'quoi', 'dont', 'est', 'es', 'suis', 'sont', 'être', 'avoir', 'ai', 'as', 'a', 'avons', 'avez', 'ont',
  'pas', 'ne', 'plus', 'très', 'bien', 'comme', 'pour', 'par', 'sur', 'sous', 'dans', 'avec', 'sans', 'chez', 'vers',
  'si', 'quand', 'comment', 'pourquoi', 'ça', 'cela', 'y', 'en', 'au', 'aux', 'à', 'se', 's',
  'bonjour', 'salut', 'coucou', 'merci', 'stp', 'svp', 'alors'
]);

const MAX_TITLE_WORDS = 4;
const FALLBACK_TRUNCATE_LEN = 36;

export function deriveDiscussionTitle(firstMessageText) {
  const clean = (firstMessageText || '').trim();
  if (!clean) return 'Nouvelle discussion';

  const words = clean.replace(/[?!.,;:«»"']/g, ' ').split(/\s+/).filter(Boolean);
  const significant = words.filter((w) => w.length > 1 && !STOPWORDS.has(w.toLowerCase()));
  const picked = (significant.length > 0 ? significant : words).slice(0, MAX_TITLE_WORDS);

  if (picked.length === 0) return truncate(clean);

  const title = picked.join(' ');
  return truncate(title.charAt(0).toUpperCase() + title.slice(1));
}

function truncate(s) {
  return s.length > FALLBACK_TRUNCATE_LEN ? s.slice(0, FALLBACK_TRUNCATE_LEN).trimEnd() + '…' : s;
}
