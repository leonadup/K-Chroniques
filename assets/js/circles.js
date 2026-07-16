export const CIRCLES = {
  parents: { id: 'parents', label: 'Parents', canReadLettres: true, isAdmin: false },
  famille: { id: 'famille', label: 'Famille', canReadLettres: false, isAdmin: false },
  amis: { id: 'amis', label: 'Amis', canReadLettres: false, isAdmin: false },
  copain: { id: 'copain', label: 'Copain', canReadLettres: true, isAdmin: false },
  moi: { id: 'moi', label: 'Moi', canReadLettres: true, isAdmin: true }
};

export function canViewEntry(circleId, entry) {
  const c = CIRCLES[circleId];
  if (!c) return false;
  if (c.isAdmin) return true;
  if (!entry.published) return false;
  if (entry.type === 'lettre' && !c.canReadLettres) return false;
  return (entry.visibility || []).includes(circleId);
}

export function canViewPhoto(circleId, entry, photo) {
  if (!canViewEntry(circleId, entry)) return false;
  const c = CIRCLES[circleId];
  if (c.isAdmin) return true;
  if (!photo.visibility || photo.visibility.length === 0) return true;
  return photo.visibility.includes(circleId);
}
