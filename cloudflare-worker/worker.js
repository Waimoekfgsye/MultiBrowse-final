/**
 * MultiBrowse Cloud Sync Worker
 * Deploy to: worker-setup-unrealvfx.unrealvfx.workers.dev
 * 
 * R2 = session ZIPs only (cookies, sessionstore, browser data)
 * D1 = profile metadata (fingerprint, proxy, name — stored as JSON in `metadata` column)
 * 
 * Bindings required in wrangler.toml:
 *   - DB: D1 database
 *   - BUCKET: R2 bucket (binding name: PROFILES_BUCKET)
 *   - JWT_SECRET: secret string
 */

// Allowed origins — restrict CORS to your actual domains
const ALLOWED_ORIGINS = [
  'https://waimoe.online',
  'http://localhost:5173',
  'http://localhost:3000',
  'app://.',              // Electron file:// origin
];

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  // Allow Electron apps (no origin or app://)
  if (!origin || origin === 'null' || origin.startsWith('app://') || origin.startsWith('file://')) return '*';
  // Allow listed origins
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow any localhost for dev
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return origin;
  return '';
}

// ── Rate limiting (per IP, in-memory for Workers) ────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 60;       // 60 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    entry = { start: now, count: 0 };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  // Cleanup old entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap) {
      if (now - v.start > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
    }
  }
  return entry.count <= RATE_LIMIT_MAX;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const corsOrigin = getCorsOrigin(request);

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': corsOrigin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return jsonResponse({ error: 'Too many requests. Try again later.' }, 429, { 'Access-Control-Allow-Origin': corsOrigin || '*' });
    }

    const corsHeaders = { 'Access-Control-Allow-Origin': corsOrigin || '*' };

    const userId = await getUserId(request, env);
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    try {
      await ensureTable(env.DB);

      if (path === '/subscription' && method === 'GET') return await getSubscription(env, userId, corsHeaders);
      if (path === '/subscription/verify' && method === 'POST') return await verifyPayment(env, userId, request, corsHeaders);
      if (path === '/profiles' && method === 'GET') return await listProfiles(env, userId, corsHeaders);

      const match = path.match(/^\/profiles\/([^/]+)$/);
      if (match) {
        const profileId = match[1];
        const type = url.searchParams.get('type') || '';

        if (method === 'PUT') {
          const name = url.searchParams.get('name') || '';
          // type=meta → store profile metadata JSON in D1 only (no R2)
          // type=session or default → store session ZIP in R2
          if (type === 'meta') {
            return await uploadProfileMeta(env, userId, profileId, name, request, corsHeaders);
          }
          return await uploadProfile(env, userId, profileId, name, request, corsHeaders);
        }

        if (method === 'GET') {
          return await downloadProfile(env, userId, profileId, corsHeaders);
        }

        if (method === 'DELETE') {
          return await deleteProfile(env, userId, profileId, corsHeaders);
        }
      }

      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      return jsonResponse({ error: err.message || 'Internal error' }, 500, corsHeaders);
    }
  },
};

// ── Helpers ──────────────────────────────────────────────────────────
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ── Auth ─────────────────────────────────────────────────────────────
async function getUserId(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  if (!env || !env.JWT_SECRET) return null;
  const token = authHeader.slice(7).trim();
  try {
    const payload = await verifyJwtHS256(token, env.JWT_SECRET);
    if (!payload) return null;
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch { return null; }
}

async function verifyJwtHS256(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const header = JSON.parse(base64UrlDecodeToString(headerB64));
  const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  if (!header || header.alg !== 'HS256') return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signatureBytes = base64UrlDecodeToUint8Array(signatureB64);
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(signingInput));
  if (!valid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= now) return null;
  return payload;
}

function base64UrlDecodeToString(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return atob(padded);
}

function base64UrlDecodeToUint8Array(input) {
  const binary = base64UrlDecodeToString(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
  return bytes;
}

// ── D1 table setup ───────────────────────────────────────────────────
async function ensureTable(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS profiles (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      size_bytes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free_trial',
      paypal_email TEXT DEFAULT '',
      paypal_transaction_id TEXT DEFAULT '',
      upgraded_at TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
  ]);

  // Add metadata column if upgrading from old schema
  try { await db.prepare("ALTER TABLE profiles ADD COLUMN metadata TEXT NOT NULL DEFAULT ''").run(); } catch {}
}

// ── Subscription ─────────────────────────────────────────────────────
async function getSubscription(env, userId, corsHeaders) {
  let row = await env.DB.prepare('SELECT plan, upgraded_at FROM subscriptions WHERE user_id = ?').bind(userId).first();
  if (!row) {
    await env.DB.prepare('INSERT INTO subscriptions (user_id, plan) VALUES (?, ?)').bind(userId, 'free_trial').run();
    row = { plan: 'free_trial', upgraded_at: '' };
  }
  return jsonResponse({ plan: row.plan, upgraded_at: row.upgraded_at || '' }, 200, corsHeaders);
}

async function verifyPayment(env, userId, request, corsHeaders) {
  const body = await request.json();
  const { paypal_email, transaction_id } = body;
  if (!transaction_id) return jsonResponse({ error: 'Missing transaction_id' }, 400, corsHeaders);
  await env.DB.prepare(`INSERT INTO subscriptions (user_id, plan, paypal_email, paypal_transaction_id, upgraded_at) VALUES (?, 'premium', ?, ?, datetime('now')) ON CONFLICT (user_id) DO UPDATE SET plan = 'premium', paypal_email = excluded.paypal_email, paypal_transaction_id = excluded.paypal_transaction_id, upgraded_at = datetime('now')`).bind(userId, paypal_email || '', transaction_id).run();
  return jsonResponse({ success: true, plan: 'premium' }, 200, corsHeaders);
}

// ── List profiles (metadata included in response) ────────────────────
async function listProfiles(env, userId, corsHeaders) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, metadata, created_at, last_synced_at, size_bytes FROM profiles WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();

  return jsonResponse({ profiles: results || [] }, 200, corsHeaders);
}

// ── Upload profile metadata JSON → D1 only (no R2) ──────────────────
async function uploadProfileMeta(env, userId, profileId, name, request, corsHeaders) {
  const bodyText = await request.text();
  if (!bodyText) return jsonResponse({ error: 'Empty body' }, 400, corsHeaders);

  await env.DB.prepare(`
    INSERT INTO profiles (id, user_id, name, metadata, created_at, last_synced_at, size_bytes)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT (user_id, id) DO UPDATE SET
      name = excluded.name,
      metadata = excluded.metadata,
      last_synced_at = datetime('now'),
      size_bytes = excluded.size_bytes
  `).bind(profileId, userId, name, bodyText, bodyText.length).run();

  return jsonResponse({ success: true, id: profileId, stored: 'metadata' }, 200, corsHeaders);
}

// ── Upload session ZIP → R2 + update D1 timestamps ──────────────────
async function uploadProfile(env, userId, profileId, name, request, corsHeaders) {
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return jsonResponse({ error: 'Empty body' }, 400, corsHeaders);
  }

  const r2Key = `${userId}/${profileId}.zip`;

  // Store session ZIP in R2
  await env.PROFILES_BUCKET.put(r2Key, body, {
    httpMetadata: { contentType: 'application/zip' },
    customMetadata: { userId, profileId, name },
  });

  // Update D1 with size and sync timestamp (don't overwrite metadata)
  await env.DB.prepare(`
    INSERT INTO profiles (id, user_id, name, created_at, last_synced_at, size_bytes)
    VALUES (?, ?, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT (user_id, id) DO UPDATE SET
      name = CASE WHEN excluded.name != '' THEN excluded.name ELSE profiles.name END,
      last_synced_at = datetime('now'),
      size_bytes = excluded.size_bytes
  `).bind(profileId, userId, name, body.byteLength).run();

  return jsonResponse({
    success: true,
    id: profileId,
    stored: 'session',
    size: body.byteLength,
  }, 200, corsHeaders);
}

// ── Download session ZIP from R2 ─────────────────────────────────────
async function downloadProfile(env, userId, profileId, corsHeaders) {
  const r2Key = `${userId}/${profileId}.zip`;

  const object = await env.PROFILES_BUCKET.get(r2Key);
  if (!object) {
    return jsonResponse({ error: 'No session data found for this profile' }, 404, corsHeaders);
  }

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Type', 'application/zip');
  headers.set('Content-Length', String(object.size));
  headers.set('Content-Disposition', `attachment; filename="${profileId}.zip"`);

  return new Response(object.body, { status: 200, headers });
}

// ── Delete profile from R2 + D1 ─────────────────────────────────────
async function deleteProfile(env, userId, profileId, corsHeaders) {
  const r2Key = `${userId}/${profileId}.zip`;

  // Delete from R2
  try {
    await env.PROFILES_BUCKET.delete(r2Key);
  } catch {}

  // Delete from D1
  await env.DB.prepare('DELETE FROM profiles WHERE user_id = ? AND id = ?').bind(userId, profileId).run();

  return jsonResponse({ success: true, id: profileId }, 200, corsHeaders);
}
