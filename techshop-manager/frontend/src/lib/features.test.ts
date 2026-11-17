import { describe, expect, it } from 'vitest';
import { canAccessPath, featureForPath, featuresForRole } from './features';

describe('featureForPath', () => {
  it.each([
    ['/dashboard', 'dashboard'],
    ['/dashboard/regional', 'dashboard'],
    ['/clients', 'clients'],
    ['/clients/abc', 'clients'],
    ['/clients/queue', 'onboarding'],
    ['/clients/new/recit', 'onboarding'],
    ['/clients/abc/activate', 'onboarding'],
    ['/clients/paiements', 'onboarding'],
    ['/sales/pos', 'caisse'],
    ['/sales', 'caisse'],
    ['/sales/v1/receipt', 'caisse'],
    ['/sales/returns', 'retours'],
    ['/sales/journal-retours', 'retours'],
    ['/sales/retours/r1/avoir', 'retours'],
    ['/stocks/transfer', 'stocks'],
    ['/mlm', 'mlm'],
    ['/mlm/commissions', 'mlm'],
    ['/mlm/members', 'mlm'],
    ['/reports/sales', 'rapports'],
  ])('%s → %s', (path, feature) => {
    expect(featureForPath(path)).toBe(feature);
  });

  it.each(['/mlm/wallet', '/mlm/levels', '/mlm/members/m1', '/settings/profile', '/support'])('%s reste toujours accessible', (path) => {
    expect(featureForPath(path)).toBeNull();
  });
});

describe('canAccessPath', () => {
  const gerant = { role: 'GERANT' as const, fonctionnalitesRetirees: ['rapports', 'mlm'] };

  it('bloque les fonctionnalités retirées et laisse le reste', () => {
    expect(canAccessPath(gerant, '/reports')).toBe(false);
    expect(canAccessPath(gerant, '/mlm/commissions')).toBe(false);
    expect(canAccessPath(gerant, '/mlm/wallet')).toBe(true);
    expect(canAccessPath(gerant, '/stocks')).toBe(true);
  });

  it('ne restreint jamais le super admin', () => {
    expect(canAccessPath({ role: 'SUPER_ADMIN', fonctionnalitesRetirees: ['rapports'] }, '/reports')).toBe(true);
  });
});

describe('featuresForRole', () => {
  it('ne propose que ce que le rôle permet', () => {
    expect(featuresForRole('AGENT').map((f) => f.key)).toEqual(['dashboard', 'clients', 'onboarding', 'stocks']);
    expect(featuresForRole('GERANT').map((f) => f.key)).toContain('rapports');
    expect(featuresForRole('SUPER_ADMIN')).toEqual([]);
  });
});
