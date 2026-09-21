import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { useAuthStore } from '@/store/auth.store';
import { useAuth } from '@/hooks/useAuth';
import { UserRoleBadge } from '@/components/settings/UserRoleBadge';
import type { Role } from '@/types';
import { hasMinimumRole, isSiteScopedStaff, requiresAssignedSite } from './roles';

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

afterEach(cleanup);

function signIn(role: Role) {
  useAuthStore.getState().setAuth({ id: 'staff', name: 'Staff', role, siteId: 'site-1' }, 'token');
}

describe('cashier identity consumers', () => {
  it('allows a cashier into an agent route before role helper extraction', () => {
    signIn('CAISSIER' as Role);
    render(createElement(MemoryRouter, { initialEntries: ['/staff'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      createElement(Routes, null,
        createElement(Route, { path: '/', element: createElement('p', null, 'Public') }),
        createElement(Route, { path: '/staff', element: createElement(RoleGuard, {
          minRole: 'AGENT', children: createElement('p', null, 'Staff access'),
        }) }),
      ),
    ));
    expect(screen.getByText('Staff access')).toBeInTheDocument();
  });

  it.each<[Role, Role, boolean]>([
    ['CAISSIER' as Role, 'AGENT', true],
    ['CAISSIER' as Role, 'GERANT', false],
    ['AGENT', 'CAISSIER' as Role, false],
    ['SUPER_ADMIN', 'CAISSIER' as Role, true],
    ['SUPER_ADMIN', 'UNKNOWN' as Role, false],
  ])('store and hook enforce %s requiring %s: %s', (role, minimum, allowed) => {
    signIn(role);
    const { result } = renderHook(() => useAuth());
    expect(useAuthStore.getState().hasRole(minimum)).toBe(allowed);
    expect(result.current.hasRole(minimum)).toBe(allowed);
  });

  it('labels a cashier in the existing role badge', () => {
    render(createElement(UserRoleBadge, { role: 'CAISSIER' as Role }));
    expect(screen.getByText('Caissier')).toBeInTheDocument();
  });
});

describe('shared role contract', () => {
  it.each<[Role | undefined, Role, boolean]>([
    ['CAISSIER', 'AGENT', true],
    ['CAISSIER', 'CAISSIER', true],
    ['CAISSIER', 'GERANT', false],
    ['CAISSIER', 'SUPER_ADMIN', false],
    ['AGENT', 'CAISSIER', false],
    ['GERANT', 'CAISSIER', true],
    ['DIRECTEUR_REGIONAL', 'CAISSIER', true],
    ['SUPER_ADMIN', 'CAISSIER', true],
    ['FORMATEUR', 'AGENT', false],
    ['CLIENT', 'AGENT', false],
    [undefined, 'AGENT', false],
    ['UNKNOWN' as Role, 'AGENT', false],
    ['SUPER_ADMIN', 'UNKNOWN' as Role, false],
    ['UNKNOWN' as Role, 'UNKNOWN' as Role, false],
    ['__proto__' as Role, '__proto__' as Role, false],
    ['constructor' as Role, 'constructor' as Role, false],
    ['toString' as Role, 'toString' as Role, false],
  ])('%s requiring %s is allowed: %s', (role, minimum, allowed) => {
    expect(hasMinimumRole(role, minimum)).toBe(allowed);
  });

  it.each<[Role, boolean, boolean]>([
    ['SUPER_ADMIN', false, false],
    ['DIRECTEUR_REGIONAL', false, false],
    ['GERANT', false, true],
    ['CAISSIER', true, true],
    ['AGENT', true, true],
    ['FORMATEUR', false, true],
    ['CLIENT', false, false],
  ])('distinguishes site scope and assignment for %s', (role, scoped, assigned) => {
    expect(isSiteScopedStaff(role)).toBe(scoped);
    expect(requiresAssignedSite(role)).toBe(assigned);
  });
});
