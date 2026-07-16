/** Redimensionne et recompresse une image côté navigateur avant upload, pour
 * rester confortablement dans le 1 Go du plan Supabase gratuit et accélérer
 * le chargement pour les proches. Invisible pour l'utilisatrice : appelé
 * automatiquement dès qu'une photo est choisie (voir admin-entries.js). */
export async function compressImage(file, { maxDimension = 1600, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Compression indisponible sur ce navigateur.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('La compression a échoué.'))),
      'image/jpeg',
      quality
    );
  });
}
