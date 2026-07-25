/**
 * JWT token refresh utility.
 * Checks if the current token is within 7 days of expiry and refreshes it.
 */
const AUTH_API = 'https://api-unrealvfx.unrealvfx.workers.dev';
const AUTH_KEY = 'multibrowse_auth';
const REFRESH_THRESHOLD_DAYS = 7;

function parseJwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string): boolean {
  const exp = parseJwtExpiry(token);
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = (exp - now) / (24 * 60 * 60);
  return daysLeft <= REFRESH_THRESHOLD_DAYS;
}

function isTokenExpired(token: string): boolean {
  const exp = parseJwtExpiry(token);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return now >= exp;
}

export async function refreshTokenIfNeeded(): Promise<string | null> {
  try {
    const saved = localStorage.getItem(AUTH_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!parsed.token || parsed.offline) return null;

    const token = parsed.token;

    // Only refresh if expiring within threshold or already expired
    if (!isTokenExpiringSoon(token) && !isTokenExpired(token)) return token;

    console.log('[TokenRefresh] Token expiring soon or expired, refreshing...');

    const res = await fetch(`${AUTH_API}/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Refresh failed' }));
      console.warn('[TokenRefresh] Refresh failed:', data.error);
      // If token is too old (>90 days), user must log in again
      if (res.status === 401) return null;
      return token; // keep using old token if server error
    }

    const data = await res.json();
    if (!data.token) return token;

    console.log('[TokenRefresh] Token refreshed successfully');

    // Update localStorage
    parsed.token = data.token;
    localStorage.setItem(AUTH_KEY, JSON.stringify(parsed));

    // Update Electron token store
    if (window.electronAPI) {
      try {
        window.electronAPI.auth.setToken(data.token);
      } catch {}
    }

    return data.token;
  } catch (err) {
    console.warn('[TokenRefresh] Error:', err);
    return null;
  }
}

export function getDaysUntilExpiry(token: string): number | null {
  const exp = parseJwtExpiry(token);
  if (!exp) return null;
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, Math.round((exp - now) / (24 * 60 * 60)));
}
