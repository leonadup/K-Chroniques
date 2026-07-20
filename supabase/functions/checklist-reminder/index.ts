// Edge Function déclenchée chaque jour par un cron GitHub Actions (voir
// .github/workflows/checklist-reminder.yml) — pas par un Database Webhook,
// puisqu'il s'agit ici de vérifier le TEMPS écoulé, pas un changement de
// ligne. Notifie Moi (circle_id = 'moi') s'il reste des points de checklist
// non cochés depuis plus de STALE_DAYS jours, sans re-notifier avant
// REMINDER_COOLDOWN_DAYS jours pour ne pas spammer.
//
// Réutilise les mêmes secrets VAPID que send-push (voir README).

import webpush from 'npm:web-push@3.6.7';

const STALE_DAYS = 10;
const REMINDER_COOLDOWN_DAYS = 7;

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails('mailto:leona.dupt@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function restHeaders() {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
}

Deno.serve(async () => {
  const now = Date.now();
  const staleBefore = new Date(now - STALE_DAYS * 86400000).toISOString();

  const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/checklist_items?done=eq.false&created_at=lte.${encodeURIComponent(staleBefore)}`, {
    headers: restHeaders()
  });
  const candidates: { id: string; title: string; last_reminded_at: string | null }[] = await itemsRes.json();

  const cooldownBefore = now - REMINDER_COOLDOWN_DAYS * 86400000;
  const toNotify = candidates.filter((it) => !it.last_reminded_at || new Date(it.last_reminded_at).getTime() < cooldownBefore);

  if (toNotify.length === 0) {
    return new Response('skip', { status: 200 });
  }

  const titles = toNotify.slice(0, 3).map((it) => it.title);
  const extra = toNotify.length - titles.length;
  const body = `${titles.join(', ')}${extra > 0 ? ` et ${extra} autre${extra > 1 ? 's' : ''}` : ''} — toujours en attente.`;
  const payload = JSON.stringify({ title: `📋 ${toNotify.length} point${toNotify.length > 1 ? 's' : ''} de checklist en attente`, body, url: 'moi.html' });

  const subsRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?circle_id=eq.moi`, { headers: restHeaders() });
  const subscriptions: { endpoint: string; p256dh: string; auth_key: string }[] = await subsRes.json();

  await Promise.all(
    (subscriptions || []).map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
            method: 'DELETE',
            headers: restHeaders()
          });
        }
      }
    })
  );

  await fetch(`${SUPABASE_URL}/rest/v1/checklist_items?id=in.(${toNotify.map((it) => it.id).join(',')})`, {
    method: 'PATCH',
    headers: restHeaders(),
    body: JSON.stringify({ last_reminded_at: new Date(now).toISOString() })
  });

  return new Response(`notified ${subscriptions?.length || 0} device(s) about ${toNotify.length} item(s)`, { status: 200 });
});
