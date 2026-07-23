// Edge Function appelée directement depuis l'éditeur de récits/lettres
// (assets/js/admin-entries.js, bouton "Envoyer la notification") — plus par
// un Database Webhook. Léona choisit elle-même, entrée par entrée, à quel(s)
// cercle(s) envoyer une notification push (aucun envoi automatique à la
// publication) ; elle peut aussi rouvrir une entrée déjà publiée plus tard
// pour renvoyer une notif à un cercle qu'elle avait sauté.
//
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont
// injectées automatiquement par Supabase pour toute Edge Function. Seules
// VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY doivent être ajoutées avec
// `supabase secrets set` (voir README).
//
// Contrairement à l'ancienne version (déclenchée par Supabase lui-même,
// donc déployée avec --no-verify-jwt), cette fonction est appelable par
// n'importe qui connaissant son URL : elle vérifie que l'appelant est
// authentifié via un vrai compte Supabase Auth (donc "Moi"/Léona — le seul
// qui existe sur ce projet, voir README) avant d'envoyer quoi que ce soit.
// Se déploie donc SANS --no-verify-jwt.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails('mailto:leona.dupt@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Requis dès qu'une Edge Function est appelée depuis le navigateur (et non
// plus seulement par Supabase lui-même) : sans ces en-têtes, le navigateur
// bloque la requête avant même qu'elle parte ("Failed to send a request to
// the Edge Function" côté supabase-js) et la preflight OPTIONS doit
// recevoir une réponse 2xx sans body.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const {
    data: { user },
    error: authError
  } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const { entryId, circleIds } = await req.json();
  if (!entryId || !Array.isArray(circleIds) || circleIds.length === 0) {
    return new Response('entryId et circleIds (non vide) requis', { status: 400, headers: corsHeaders });
  }

  const { data: entry, error: entryError } = await adminClient
    .from('entries')
    .select('id, type, title, excerpt, published, visibility, notified_circles')
    .eq('id', entryId)
    .maybeSingle();

  if (entryError || !entry || !entry.published) {
    return new Response('entrée introuvable ou non publiée', { status: 404, headers: corsHeaders });
  }

  // Filet de sécurité : on ne notifie jamais un cercle qui n'a de toute
  // façon pas le droit de voir cette entrée, même si le client en a
  // demandé un par erreur.
  const targetCircles = circleIds.filter((c: string) => (entry.visibility || []).includes(c));
  if (targetCircles.length === 0) {
    return new Response("aucun des cercles demandés n'a accès à cette entrée", { status: 400, headers: corsHeaders });
  }

  const { data: subscriptions } = await adminClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key, circle_id')
    .in('circle_id', targetCircles);

  const title = entry.type === 'lettre' ? 'Nouvelle lettre de Léona 💌' : 'Nouveau récit de Léona 🇰🇷';
  const bodyText = (entry.excerpt || entry.title || '').slice(0, 140);
  const notifPayload = JSON.stringify({ title, body: `${entry.title}${bodyText ? ' — ' + bodyText : ''}`, url: 'cercle.html' });

  let sent = 0;
  await Promise.all(
    (subscriptions || []).map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, notifPayload);
        sent += 1;
      } catch (err) {
        // 404/410 = l'abonnement n'est plus valide côté navigateur (site
        // désinstallé, permission révoquée...) : on le retire silencieusement.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    })
  );

  const notifiedCircles = Array.from(new Set([...(entry.notified_circles || []), ...targetCircles]));
  await adminClient.from('entries').update({ notified_circles: notifiedCircles }).eq('id', entryId);

  return new Response(JSON.stringify({ ok: true, notifiedCircles: targetCircles, subscriptionsSent: sent }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
