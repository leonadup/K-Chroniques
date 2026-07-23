// Edge Function déclenchée par un Database Webhook Supabase (voir README)
// sur la table `comments`, événement INSERT. Notifie Léona ("Moi", cercle
// `moi`) qu'un cercle a laissé un commentaire — au plus une notif par
// (entrée, cercle) tant qu'elle n'a pas rouvert l'entrée dans l'admin
// (assets/js/admin-entries.js marque alors tous ses commentaires comme vus,
// ce qui réarme la notif pour un futur commentaire). Sans ça, plusieurs
// commentaires d'un même cercle avant qu'elle ne regarde la
// submergeraient de notifs.
//
// Appelée par Supabase lui-même (comme l'était l'ancien send-push), pas par
// une personne connectée : se déploie avec --no-verify-jwt, voir README.
//
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement.
// Réutilise les mêmes clés VAPID que send-push.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails('mailto:leona.dupt@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CIRCLE_LABELS: Record<string, string> = { parents: 'Parents', famille: 'Famille', amis: 'Amis', copain: 'ton copain' };

Deno.serve(async (req) => {
  const payload = await req.json();
  const comment = payload.record;
  if (!comment) return new Response('skip', { status: 200 });

  // Regroupement par (entrée, cercle) : s'il y a déjà d'autres commentaires
  // non vus de ce cercle sur cette entrée, une notif est déjà partie pour
  // ce lot — on ne renvoie rien tant que Léona n'a pas rouvert l'entrée.
  const { data: pending } = await adminClient
    .from('comments')
    .select('id')
    .eq('entry_id', comment.entry_id)
    .eq('circle_id', comment.circle_id)
    .eq('seen_by_moi', false);

  if ((pending || []).length > 1) {
    return new Response('skip (déjà notifié pour ce lot)', { status: 200 });
  }

  const { data: entry } = await adminClient.from('entries').select('title').eq('id', comment.entry_id).maybeSingle();
  const { data: subscriptions } = await adminClient.from('push_subscriptions').select('endpoint, p256dh, auth_key').eq('circle_id', 'moi');

  const circleLabel = CIRCLE_LABELS[comment.circle_id] || comment.circle_id;
  const title = `💬 ${circleLabel} a commenté`;
  const bodyText = (comment.body || '').slice(0, 140);
  const notifPayload = JSON.stringify({
    title,
    body: `${entry?.title || ''}${bodyText ? ' — ' + bodyText : ''}`,
    url: 'moi.html'
  });

  await Promise.all(
    (subscriptions || []).map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, notifPayload);
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    })
  );

  return new Response('ok', { status: 200 });
});
