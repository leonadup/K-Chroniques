// Edge Function déclenchée par un Database Webhook Supabase (voir README)
// sur la table `discussion_messages`, événement INSERT. Notifie Léona
// ("Moi", cercle `moi`) qu'une personne a répondu dans une discussion — au
// plus une notif par fil tant qu'elle n'a pas rouvert le fil dans l'admin
// (assets/js/admin-discussions.js met alors à jour `last_seen_by_moi_at`,
// ce qui réarme la notif pour un futur message). Même logique de
// regroupement que notify-comment, pour ne pas la submerger si plusieurs
// messages arrivent dans le même fil avant qu'elle ne regarde.
//
// Appelée par Supabase lui-même (comme notify-comment), pas par une
// personne connectée : se déploie avec --no-verify-jwt, voir README.
//
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement.
// Réutilise les mêmes clés VAPID que send-push / notify-comment.

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
  const message = payload.record;
  if (!message || message.is_moi) return new Response('skip', { status: 200 });

  const { data: discussion } = await adminClient
    .from('discussions')
    .select('circle_id, title, last_seen_by_moi_at')
    .eq('id', message.discussion_id)
    .maybeSingle();
  if (!discussion) return new Response('skip', { status: 200 });

  // Regroupement par fil : s'il y a déjà d'autres messages non lus par Moi
  // dans ce fil depuis sa dernière visite, une notif est déjà partie pour
  // ce lot — on ne renvoie rien tant qu'elle n'a pas rouvert le fil.
  const { data: pending } = await adminClient
    .from('discussion_messages')
    .select('id')
    .eq('discussion_id', message.discussion_id)
    .eq('is_moi', false)
    .gt('created_at', discussion.last_seen_by_moi_at ?? '1970-01-01');

  if ((pending || []).length > 1) {
    return new Response('skip (déjà notifié pour ce fil)', { status: 200 });
  }

  const { data: subscriptions } = await adminClient.from('push_subscriptions').select('endpoint, p256dh, auth_key').eq('circle_id', 'moi');

  const circleLabel = CIRCLE_LABELS[discussion.circle_id] || discussion.circle_id;
  const bodyText = (message.body || '').slice(0, 140);
  const notifPayload = JSON.stringify({
    title: `💬 ${message.author_name} (${circleLabel})`,
    body: `${discussion.title}${bodyText ? ' — ' + bodyText : ''}`,
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
