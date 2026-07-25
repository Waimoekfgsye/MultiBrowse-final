/**
 * Security utilities for MultiBrowse.
 * - PIN hashing (SHA-256)
 * - Proxy credential encryption (AES-GCM with device-derived key)
 */

// ── PIN Hashing ──────────────────────────────────────────────────────
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode('multibrowse-pin-salt-v2:' + pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const computed = await hashPin(pin);
  return computed === hash;
}

// ── Proxy Credential Encryption ──────────────────────────────────────
// Uses a device-stable key derived from a fixed seed stored in localStorage.
// This is not military-grade — it prevents plain-text credential storage
// and casual reading of exported JSON / cloud-synced data.

function getOrCreateDeviceKey(): string {
  const KEY = 'mb_device_key';
  let key = localStorage.getItem(KEY);
  if (!key) {
    key = crypto.randomUUID() + '-' + crypto.randomUUID();
    localStorage.setItem(KEY, key);
  }
  return key;
}

async function deriveKey(seed: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(seed),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('multibrowse-proxy-v2'),
      iterations: 10000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptField(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  try {
    const key = await deriveKey(getOrCreateDeviceKey());
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    );
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return 'enc:' + btoa(String.fromCharCode(...combined));
  } catch {
    return plaintext; // fallback to plain if crypto fails
  }
}

export async function decryptField(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith('enc:')) return ciphertext;
  try {
    const key = await deriveKey(getOrCreateDeviceKey());
    const raw = Uint8Array.from(atob(ciphertext.slice(4)), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return ciphertext; // return as-is if decryption fails (different device key)
  }
}
