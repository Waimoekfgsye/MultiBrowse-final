/**
 * Subscription types and permission logic
 *
 * Plans:
 *   'free_trial' — default for new online accounts, 1 profile max, no edit/delete/regen
 *   'premium'    — unlimited profiles, full access
 *   'offline'    — local mode, unlimited, no restrictions
 */

export type SubscriptionPlan = 'free_trial' | 'premium' | 'offline';

export const PAYPAL_LINK = 'https://paypal.me/WaiMoeGD/25';
export const PREMIUM_PRICE = '$25';

export interface Permissions {
  canCreateProfile: boolean;
  canEditProfile: boolean;
  canDeleteProfile: boolean;
  canRegenFingerprint: boolean;
  canDuplicateProfile: boolean;
  canImportProfiles: boolean;
  canExportProfiles: boolean;
  canLockProfile: boolean;
  maxProfiles: number; // -1 = unlimited
}

export function getPermissions(plan: SubscriptionPlan, currentProfileCount: number): Permissions {
  if (plan === 'premium') {
    return {
      canCreateProfile: true,
      canEditProfile: true,
      canDeleteProfile: true,
      canRegenFingerprint: true,
      canDuplicateProfile: true,
      canImportProfiles: true,
      canExportProfiles: true,
      canLockProfile: true,
      maxProfiles: -1,
    };
  }

  if (plan === 'offline') {
    return {
      canCreateProfile: true,
      canEditProfile: true,
      canDeleteProfile: true,
      canRegenFingerprint: true,
      canDuplicateProfile: true,
      canImportProfiles: false,
      canExportProfiles: false,
      canLockProfile: false,
      maxProfiles: -1,
    };
  }

  // free_trial
  return {
    canCreateProfile: currentProfileCount < 1,
    canEditProfile: false,
    canDeleteProfile: false,
    canRegenFingerprint: false,
    canDuplicateProfile: false,
    canImportProfiles: false,
    canExportProfiles: false,
    canLockProfile: false,
    maxProfiles: 1,
  };
}

/** Extract plan from JWT token payload (if present) */
export function getPlanFromToken(token: string): SubscriptionPlan {
  if (!token) return 'offline';
  try {
    const parts = token.split('.');
    if (parts.length < 2) return 'free_trial';
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    if (payload.plan === 'premium') return 'premium';
    return 'free_trial';
  } catch {
    return 'free_trial';
  }
}
