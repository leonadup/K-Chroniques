/** Mapping simple par mois. Chuseok et Seollal suivent le calendrier lunaire
 * et bougent chaque année de quelques semaines — ce mapping donne une
 * approximation raisonnable pour un accent visuel, pas une date exacte. */
export function currentSeason(date = new Date()) {
  const month = date.getMonth() + 1; // 1-12
  if (month === 1 || month === 2) return 'seollal';
  if (month === 3 || month === 4) return 'cerisiers';
  if (month >= 5 && month <= 8) return 'ete';
  if (month === 9 || month === 10) return 'chuseok';
  return 'hiver'; // novembre, décembre
}

export function applySeason() {
  document.documentElement.setAttribute('data-season', currentSeason());
}
