import { ACCESS_CODES } from './config.js';
import { supabase } from './supabase-client.js';

const STORAGE_KEY = 'fds_circle';

export function getCircle() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setCircle(id) {
  localStorage.setItem(STORAGE_KEY, id);
}

export function clearCircle() {
  localStorage.removeItem(STORAGE_KEY);
}

export function checkCode(circleId, code) {
  return typeof ACCESS_CODES[circleId] === 'string' && ACCESS_CODES[circleId] === code;
}

/** À appeler en haut de cercle.html : redirige vers acceder.html si aucun
 * cercle valide n'est mémorisé dans ce navigateur. */
export function requireCircleOrRedirect() {
  const circle = getCircle();
  if (!circle || !ACCESS_CODES[circle]) {
    window.location.href = 'acceder.html';
    return null;
  }
  return circle;
}

export function logout() {
  clearCircle();
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
