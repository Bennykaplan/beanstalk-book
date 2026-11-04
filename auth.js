import crypto from 'node:crypto';
import { query } from './db.js';
import { log } from './log.js';

const SESSION_DAYS = 30;
// Local-only shortcut for tests. Needs an explicit flag and can never turn on inside Render.
export const DEV_LOGIN = process.env.DEV_LOGIN === '1' && !process.env.RENDER;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.RENDER) throw new Error('SESSION_SECRET is not set.');
  return 'local-dev-only';
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const cookieOpts = (req, maxAge) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge });

function startSession(req, res, userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 86400_000 })).toString('base64url');
  res.cookie('sid', `${payload}.${sign(payload)}`, cookieOpts(req, SESSION_DAYS * 86400_000));
}

function readSession(req) {
  const [payload, sig] = (readCookies(req).sid || '').split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return session.exp > Date.now() ? session : null;
}

export async function loadUser(req, _res, next) {
  try {
    const session = readSession(req);
    if (session) {
      const { rows } = await query('SELECT id, email, name FROM users WHERE id = $1', [session.uid]);
      req.user = rows[0];
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

async function upsertUser(sub, email, name) {
  const { rows } = await query(
    `INSERT INTO users (google_sub, email, name) VALUES ($1, $2, $3)
     ON CONFLICT (google_sub) DO UPDATE SET email = $2, name = $3, last_seen = now()
     RETURNING id`,
    [sub, email, name],
  );
  return rows[0].id;
}

const redirectUri = (req) => `${req.protocol}://${req.get('host')}/auth/google/callback`;

export function authRoutes(app) {
  app.get('/auth/google', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).send('Google sign-in is not configured.');
    const state = crypto.randomBytes(24).toString('base64url');
    res.cookie('oauth_state', state, cookieOpts(req, 600_000));
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get('/auth/google/callback', async (req, res) => {
    const expected = readCookies(req).oauth_state;
    res.clearCookie('oauth_state', { path: '/' });
    try {
      if (req.query.error) throw new Error(`Google said: ${req.query.error}`);
      if (!expected || req.query.state !== expected) throw new Error('state mismatch');
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          code: String(req.query.code),
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri(req),
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await r.json();
      if (!r.ok) throw new Error(`token exchange failed: ${tokens.error}`);
      // The ID token came straight from Google over TLS, so its claims can be read directly
      // (OpenID Connect Core 3.1.3.7). Audience, issuer and expiry are still checked.
      const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
      const issuerOk = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss);
      if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !issuerOk || claims.exp * 1000 < Date.now()) {
        throw new Error('invalid ID token');
      }
      const userId = await upsertUser(claims.sub, claims.email, claims.name);
      startSession(req, res, userId);
      log('login', { user: userId });
      res.redirect('/');
    } catch (e) {
      log('login_failed', { error: e.message });
      res.redirect('/?login=failed');
    }
  });

  app.post('/auth/logout', (req, res) => {
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });

  if (DEV_LOGIN) {
    app.post('/auth/dev', async (req, res) => {
      const who = String(req.body.who || 'dev');
      startSession(req, res, await upsertUser(`dev:${who}`, `${who}@example.test`, who));
      res.json({ ok: true });
    });
  }
}
