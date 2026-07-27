import { supabase } from './supabase-client.js';

const STORAGE_KEY = 'fds_person';

/** Personne identifiée sur cet appareil — { id, circleId, name } — ou null. */
export function getPerson() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setPerson(person) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(person));
}

export function clearPerson() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getPersonName() {
  return getPerson()?.name || '';
}

export function getPersonId() {
  return getPerson()?.id || null;
}

/** Vérifie un code personnel auprès de Supabase (table `people`, via une
 * fonction security definer qui ne renvoie que la ligne correspondante,
 * jamais toute la table). Retourne la personne trouvée ou null. */
export async function checkPersonCode(code) {
  if (!code) return null;
  const { data, error } = await supabase.rpc('check_person_code', { p_code: code });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return { id: row.id, circleId: row.circle_id, name: row.name };
}

/** À appeler en haut de cercle.html : redirige vers acceder.html si aucune
 * personne valide n'est mémorisée dans ce navigateur. Retourne le circleId
 * (les appelants existants ne connaissent que ça). */
export function requireCircleOrRedirect() {
  const person = getPerson();
  if (!person?.circleId) {
    window.location.href = 'acceder.html';
    return null;
  }
  return person.circleId;
}

export function logout() {
  clearPerson();
  window.location.href = 'index.html';
}

// --- Moi : vrai compte Supabase Auth (seule protection réelle du site) ---

export async function signInMoi(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function getMoiSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOutMoi() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}
