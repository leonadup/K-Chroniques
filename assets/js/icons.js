/** Petit set d'icônes SVG en ligne (style trait, 24x24, currentColor) utilisé
 * pour remplacer les émojis sur la page d'accueil "Moi". `icon(name, size)`
 * renvoie le balisage `<svg>` prêt à insérer via innerHTML. */

const PATHS = {
  wave: `<path d="M12 3c0 3.5 2.5 5 4 8-2 2-2.5 5.5-2.5 8" fill="none" stroke="currentColor"/><path d="M12 3c0 3.5-2.5 5-4 8 2 2 2.5 5.5 2.5 8" fill="none" stroke="currentColor"/>`,
  wallet: `<path d="M4 7h13a3 3 0 0 1 3 3v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/><path d="M4 7V6a2 2 0 0 1 2-2h9"/><circle cx="16.2" cy="13.2" r="1.1" fill="currentColor" stroke="none"/>`,
  filetext: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>`,
  pin: `<path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/>`,
  chat: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
  flag: `<path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/>`,
  flame: `<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1-2-1-3-1-5 2 1 4 4 4 7a6 6 0 0 1-12 0c0-4 3-6 6-10Z" fill="currentColor" stroke="none"/>`,
  book: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>`,
  checkcircle: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
  alert: `<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>`,
  compass: `<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-1.8 5.2-5.2 1.8 1.8-5.2 5.2-1.8Z"/>`,
  notes: `<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="0.9" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="0.9" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="0.9" fill="currentColor" stroke="none"/>`
};

export function icon(name, size = 20, extraClass = '') {
  const inner = PATHS[name] || '';
  return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
