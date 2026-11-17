import type { AuthUser, Role } from '@/types';
import { hasMinimumRole } from '@/lib/roles';

/**
 * Fonctionnalités que le super admin peut retirer à un utilisateur précis, en
 * plus des limites de son rôle (ex. un gérant sans accès aux rapports).
 * Le rôle reste le plafond : on ne peut que restreindre, jamais élargir.
 *
 * Liste dupliquée côté serveur : backend/src/common/access/features.ts — le
 * serveur bloque aussi les routes correspondantes (garder les deux synchro).
 */
export type Feature =
  | 'dashboard'
  | 'clients'
  | 'onboarding'
  | 'caisse'
  | 'retours'
  | 'stocks'
  | 'mlm'
  | 'rapports';

export interface FeatureInfo {
  key: Feature;
  label: string;
  description: string;
  /** Rôle minimum pour que la fonctionnalité existe pour cet utilisateur. */
  minRole: Role;
}

export const FEATURES: FeatureInfo[] = [
  { key: 'dashboard', label: 'Tableau de bord', description: 'Chiffres du jour, graphique des ventes, alertes', minRole: 'AGENT' },
  { key: 'clients', label: 'Fiches clients', description: 'Consulter et modifier les clients, attribuer un parrain', minRole: 'AGENT' },
  { key: 'onboarding', label: 'Enregistrement des clients', description: "File d'attente, étapes d'adhésion, paiements d'adhésion, import", minRole: 'AGENT' },
  { key: 'caisse', label: 'Caisse et ventes', description: 'Encaisser, historique des ventes, reçus', minRole: 'CAISSIER' },
  { key: 'retours', label: 'Retours et avoirs', description: 'Retours produits, journal des retours, écritures', minRole: 'GERANT' },
  { key: 'stocks', label: 'Stock', description: 'Inventaire, entrées, transferts, alertes, nouveaux produits', minRole: 'AGENT' },
  { key: 'mlm', label: 'Gestion du réseau MLM', description: 'Membres, arbre, commissions, retraits, bonus, réclamations', minRole: 'GERANT' },
  { key: 'rapports', label: 'Rapports et exports', description: 'Rapports de ventes et de stock, exports', minRole: 'GERANT' },
];

const ONBOARDING_STEP = /^\/clients\/[^/]+\/(recit|formation|fiche|activate)\/?$/;

/**
 * Fonctionnalité à laquelle appartient une adresse de l'application, ou null
 * si l'écran reste accessible à tous (profil, portefeuille, niveaux MLM…).
 */
export function featureForPath(pathname: string): Feature | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/dashboard' || p.startsWith('/dashboard/')) return 'dashboard';

  if (['/clients/new/recit', '/clients/queue', '/clients/paiements', '/clients/import'].includes(p) || ONBOARDING_STEP.test(p)) {
    return 'onboarding';
  }
  if (p === '/clients' || p.startsWith('/clients/')) return 'clients';

  if (p === '/sales/returns' || p === '/sales/journal-retours' || p.startsWith('/sales/retours/')) return 'retours';
  if (p === '/sales' || p.startsWith('/sales/')) return 'caisse';

  if (p === '/stocks' || p.startsWith('/stocks/')) return 'stocks';

  // Portefeuille, niveaux et progression d'un membre : personnels, toujours ouverts.
  if (p === '/mlm/wallet' || p === '/mlm/levels' || /^\/mlm\/members\/[^/]+$/.test(p)) return null;
  if (p === '/mlm' || p.startsWith('/mlm/')) return 'mlm';

  if (p === '/reports' || p.startsWith('/reports/')) return 'rapports';
  return null;
}

/** Le super admin n'est jamais restreint. */
export function hasFeature(user: Pick<AuthUser, 'role' | 'fonctionnalitesRetirees'> | null | undefined, feature: Feature | null): boolean {
  if (!feature || !user) return true;
  if (user.role === 'SUPER_ADMIN') return true;
  return !(user.fonctionnalitesRetirees ?? []).includes(feature);
}

export function canAccessPath(user: Pick<AuthUser, 'role' | 'fonctionnalitesRetirees'> | null | undefined, pathname: string): boolean {
  return hasFeature(user, featureForPath(pathname));
}

/** Fonctionnalités proposées dans le formulaire pour un rôle donné. */
export function featuresForRole(role: Role): FeatureInfo[] {
  if (role === 'SUPER_ADMIN') return [];
  return FEATURES.filter((f) => hasMinimumRole(role, f.minRole));
}
