// Runs in front of the built page (wrangler.jsonc: run_worker_first). It serves
// the dashboard only to a signed-in browser, and it is the only caller of the
// n8n stats webhook, to which it adds the key that n8n requires.
// Secrets: PASSWORD_HASH (from scripts/hash-password.mjs) and N8N_KEY.
import { ENVIRONMENTS, RANGES } from '../src/endpoints.js';
import { signSession, validSession, verifyPassword } from './auth.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'session';
const cookie = (value, maxAge) => `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
const redirect = (location, headers = {}) => new Response(null, { status: 303, headers: { Location: location, ...headers } });

// What a browser may fetch before signing in: the sign-in page and its styles.
const isPublic = (path) => path === '/login' || path === '/login.html' || path.startsWith('/fonts/') || /^\/assets\/[^/]+\.css$/.test(path);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const post = request.method === 'POST';

    if (path === '/api/login' && post) {
      // ponytail: per-IP limit only. Add a lockout if the password is ever guessable.
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (env.LOGIN_LIMITER && !(await env.LOGIN_LIMITER.limit({ key: ip })).success) return redirect('/login?error=2');
      const password = (await request.formData().catch(() => null))?.get('password');
      if (!(await verifyPassword(password, env.PASSWORD_HASH))) return redirect('/login?error=1');
      return redirect('/', { 'Set-Cookie': cookie(await signSession(env.PASSWORD_HASH, Date.now() + WEEK_MS), WEEK_MS / 1000) });
    }
    if (path === '/api/logout' && post) return redirect('/login', { 'Set-Cookie': cookie('', 0) });

    const sent = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const signedIn = await validSession(env.PASSWORD_HASH, sent);

    if (path.startsWith('/api/')) {
      if (!signedIn) return new Response('Sign in first.', { status: 401 });
      // The host comes from the fixed list, never from the request.
      const base = ENVIRONMENTS.find((e) => e.id === url.searchParams.get('env'))?.base;
      if (path !== '/api/stats' || !post || !base) return new Response('Not found.', { status: 404 });
      // ponytail: one key for dev, staging and production. Use a secret per environment if they must differ.
      // The window n8n should query: { range, since, until } as ISO times.
      const range = RANGES.find((r) => r.id === url.searchParams.get('range')) || RANGES.find((r) => r.id === '24h');
      const now = Date.now();
      const reply = await fetch(`${base}/webhook/dashboard-stats?range=${range.id}`, {
        method: 'POST',
        headers: { 'X-Dashboard-Key': env.N8N_KEY || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: range.id, since: new Date(now - range.hours * 3600 * 1000).toISOString(), until: new Date(now).toISOString() }),
      });
      return new Response(reply.body, { status: reply.status, headers: { 'Content-Type': reply.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
    }

    if (signedIn && path === '/login') return redirect('/');
    if (signedIn || isPublic(path)) return env.ASSETS.fetch(request);
    return redirect('/login');
  },
};
