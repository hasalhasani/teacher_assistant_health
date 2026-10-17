// Password hashing and the signed session cookie. Web Crypto only, so the same
// code runs in the Worker, in Node (scripts/hash-password.mjs) and in the tests.

// Cloudflare Workers refuse PBKDF2 above 100,000 iterations.
const ITERATIONS = 100000;
const encoder = new TextEncoder();

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array((hex.match(/../g) || []).map((pair) => parseInt(pair, 16)));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

// -> "iterations:saltHex:hashHex", the value kept in the PASSWORD_HASH secret.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${ITERATIONS}:${toHex(salt)}:${await pbkdf2(password, salt, ITERATIONS)}`;
}

export async function verifyPassword(password, stored) {
  const [iterations, salt, hash] = String(stored || '').split(':');
  if (!hash || typeof password !== 'string') return false;
  const attempt = await pbkdf2(password, fromHex(salt), Number(iterations));
  // Compare every character, so timing does not show how much of it matched.
  let diff = attempt.length ^ hash.length;
  for (let i = 0; i < attempt.length; i += 1) diff |= attempt.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

const hmacKey = (secret) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

// The cookie value is "expiryMs.signature". It is signed with the stored
// password hash, so changing the password also ends every session.
export async function signSession(secret, expires) {
  return `${expires}.${toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(String(expires))))}`;
}

export async function validSession(secret, value, now = Date.now()) {
  const [expires, signature] = String(value || '').split('.');
  if (!secret || !signature || !(Number(expires) > now)) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), fromHex(signature), encoder.encode(expires));
}
