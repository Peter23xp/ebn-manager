/**
 * Fonctionnalités que le super admin peut retirer à un utilisateur précis,
 * en plus des limites de son rôle (ex. un gérant sans accès aux rapports).
 *
 * Le rôle reste le plafond : retirer une fonctionnalité ne fait que restreindre,
 * jamais élargir. Le super admin n'est jamais restreint.
 *
 * Liste dupliquée côté frontend : frontend/src/lib/features.ts (garder synchro).
 */
export const FEATURES = [
  'dashboard',
  'clients',
  'onboarding',
  'caisse',
  'retours',
  'stocks',
  'mlm',
  'rapports',
] as const;

export type Feature = (typeof FEATURES)[number];

export function isFeature(value: unknown): value is Feature {
  return typeof value === 'string' && (FEATURES as readonly string[]).includes(value);
}

/** Dédoublonne et ne garde que des clés connues. */
export function sanitizeFeatures(values: readonly unknown[] | undefined | null): Feature[] {
  return [...new Set((values ?? []).filter(isFeature))];
}
