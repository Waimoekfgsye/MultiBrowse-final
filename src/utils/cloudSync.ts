/**
 * Cloud sync client for MultiBrowse
 * Backend: Cloudflare Worker + D1 (metadata) + R2 (session data)
 *
 * Profile metadata (fingerprint, proxy, name) → stored in D1 via ?type=meta
 * Session data (cookies, sessionstore ZIP) → stored in R2 by electron/main.cjs
 * These two never overwrite each other.
 */
import type { BrowserProfile } from '../types';

const API = 'https://worker-setup-unrealvfx.unrealvfx.workers.dev';

function authHeaders(token: string): Record<string, string> {
  return { 'Authorization': `Bearer ${token}` };
}

export interface CloudProfileMeta {
  id: string;
  name: string;
  metadata: string;
  created_at: string;
  last_synced_at: string;
  size_bytes: number;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return (data as any).error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** List all profile metadata for the authenticated user (includes metadata JSON in response) */
export async function listCloudProfiles(token: string): Promise<CloudProfileMeta[]> {
  const res = await fetch(`${API}/profiles`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data as any).profiles || [];
}

/** Upload profile metadata to D1 (NOT R2 — does not touch session data) */
export async function uploadCloudProfile(token: string, profile: BrowserProfile): Promise<boolean> {
  const json = JSON.stringify(profile);
  const res = await fetch(`${API}/profiles/${profile.id}?name=${encodeURIComponent(profile.name)}&type=meta`, {
    method: 'PUT',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: json,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return true;
}

/** Delete a profile from R2 + D1 */
export async function deleteCloudProfile(token: string, profileId: string): Promise<boolean> {
  const res = await fetch(`${API}/profiles/${profileId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return true;
}

/** Pull all profiles from cloud — reads metadata from D1 list response (no individual R2 downloads) */
export async function pullAllProfiles(token: string): Promise<BrowserProfile[]> {
  const metaList = await listCloudProfiles(token);
  if (metaList.length === 0) return [];

  const profiles: BrowserProfile[] = [];
  for (const meta of metaList) {
    if (meta.metadata) {
      try {
        const profile = JSON.parse(meta.metadata) as BrowserProfile;
        profiles.push(profile);
      } catch {
        // metadata column has invalid JSON — skip this profile
        console.warn(`[CloudSync] Failed to parse metadata for profile ${meta.id}`);
      }
    }
  }
  return profiles;
}

/** Push all profiles to cloud */
export async function pushAllProfiles(token: string, profiles: BrowserProfile[]): Promise<void> {
  const batchSize = 5;
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    await Promise.all(batch.map(p => uploadCloudProfile(token, p)));
  }
}
