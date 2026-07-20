// Edge Function déclenchée par un Database Webhook Supabase (voir README)
// sur la table `entries`, pour les événements INSERT et UPDATE. Envoie une
// notification push à tous les abonnés du/des cercle(s) concerné(s) quand
// un récit ou une lettre passe de brouillon à publié.
//
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement
// par Supabase pour toute Edge Function — pas besoin de les configurer à la
// main. Seules VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY doivent être ajoutées
// avec `supabase secrets set` (voir README).

import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails('mailto:leona.dupt@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  const payload = await req.json();
  const record = payload.record;
  const oldRecord = payload.old_record;

  // On ne notifie que le passage brouillon → publié, jamais une simple
  // modification d'une entrée déjà publiée (sinon corriger une faute de
  // frappe repush tout le monde).
  const justPublished = record?.published === true && oldRecord?.published !== true;
  if (!justPublished) {
    return new Response('skip', { status: 200 });
  }

  const circles = (record.visibility || []).join(',');
  const subsRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?circle_id=in.(${circles})`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`
    }
  });
  const subscriptions = await subsRes.json();

  const title = record.type === 'lettre' ? 'Nouvelle lettre de Léona 💌' : 'Nouveau récit de Léona 🇰🇷';
  const bodyText = (record.excerpt || record.title || '').slice(0, 140);
  const notifPayload = JSON.stringify({ title, body: `${record.title}${bodyText ? ' — ' + bodyText : ''}`, url: 'cercle.html' });

  await Promise.all(
    (subscriptions || []).map(async (sub: { endpoint: string; p256dh: string; auth_key: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          notifPayload
        );
      } catch (err) {
        // 404/410 = l'abonnement n'est plus valide côté navigateur (site
        // désinstallé, permission révoquée...) : on le retire silencieusement.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
            method: 'DELETE',
            headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
          });
        }
      }
    })
  );

  return new Response('ok', { status: 200 });
});
