/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleGuard } from './RoleGuard';
import { useAuthStore } from '@/store/auth.store';

function setAuth(role: string, id: string) {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id, role } as never,
    accessToken: 't',
  });
}

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<div>landing</div>} />
        <Route path="/dashboard" element={<div>back-office</div>} />
        <Route path="/portal/home" element={(
          <RoleGuard minRole="CLIENT" maxRole="CLIENT"><div>portail</div></RoleGuard>
        )} />
        <Route path="/admin-area" element={(
          <RoleGuard minRole="AGENT"><div>staff-zone</div></RoleGuard>
        )} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleGuard avec maxRole (cloisonnement portail/back-office)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null });
  });

  test('un STAFF (GERANT) qui ouvre /portal/home est renvoyé au back-office', () => {
    setAuth('GERANT', 'u1');
    renderAt('/portal/home');
    expect(screen.getByText('back-office')).toBeInTheDocument();
    expect(screen.queryByText('portail')).not.toBeInTheDocument();
  });

  test('un CLIENT reste dans son portail', () => {
    setAuth('CLIENT', 'c1');
    renderAt('/portal/home');
    expect(screen.getByText('portail')).toBeInTheDocument();
  });

  test('un CLIENT qui ouvre le back-office est renvoyé vers son portail', () => {
    setAuth('CLIENT', 'c1');
    renderAt('/admin-area');
    expect(screen.getByText('portail')).toBeInTheDocument();
  });

  test('un AGENT accède normalement au back-office', () => {
    setAuth('AGENT', 'a1');
    renderAt('/admin-area');
    expect(screen.getByText('staff-zone')).toBeInTheDocument();
  });

  test.each(['CAISSIER', 'SUPER_ADMIN'])('%s accède au back-office sans dépasser le plafond implicite', (role) => {
    setAuth(role, 'staff');
    renderAt('/admin-area');
    expect(screen.getByText('staff-zone')).toBeInTheDocument();
  });

  test.each(['CAISSIER', 'SUPER_ADMIN'])('%s reste exclu du portail client', (role) => {
    setAuth(role, 'staff');
    renderAt('/portal/home');
    expect(screen.getByText('back-office')).toBeInTheDocument();
    expect(screen.queryByText('portail')).not.toBeInTheDocument();
  });

  test('un caissier ne reçoit pas les droits gérant', () => {
    setAuth('CAISSIER', 'staff');
    render(<MemoryRouter initialEntries={['/manager']}><Routes>
      <Route path="/" element={<div>landing</div>} />
      <Route path="/dashboard" element={<div>back-office</div>} />
      <Route path="/manager" element={<RoleGuard minRole="GERANT"><div>manager-zone</div></RoleGuard>} />
    </Routes></MemoryRouter>);
    expect(screen.getByText('back-office')).toBeInTheDocument();
    expect(screen.queryByText('manager-zone')).not.toBeInTheDocument();
  });
});

describe('RoleGuard FORMATEUR (pas de boucle de redirection)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null });
  });

  test('FORMATEUR bloqué du portail est renvoyé vers / (pas /dashboard → boucle)', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'f1', role: 'FORMATEUR', name: 'Formateur' } as never,
      accessToken: 't',
    });
    render(
      <MemoryRouter initialEntries={['/portal/home']}>
        <Routes>
          <Route path="/" element={<div>landing</div>} />
          <Route path="/dashboard" element={<div>back-office</div>} />
          <Route path="/portal/home" element={(
            <RoleGuard minRole="CLIENT" maxRole="CLIENT"><div>portail</div></RoleGuard>
          )} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('landing')).toBeInTheDocument();
  });
});

describe('Seuil de caisse', () => {
  test.each(['AGENT', 'CAISSIER', 'GERANT'])('%s respecte le seuil caissier', role => {
    setAuth(role, 'staff');
    render(<MemoryRouter initialEntries={['/cashier']}><Routes>
      <Route path="/dashboard" element={<div>consultation</div>} />
      <Route path="/cashier" element={<RoleGuard minRole="CAISSIER"><div>encaissement</div></RoleGuard>} />
    </Routes></MemoryRouter>);
    expect(screen.getByText(role === 'AGENT' ? 'consultation' : 'encaissement')).toBeInTheDocument();
  });
});
