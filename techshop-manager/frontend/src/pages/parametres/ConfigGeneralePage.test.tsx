import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { api } from '@/lib/api';
import type { AppConfig, SystemStats } from '@/lib/settings.api';
import { useAuthStore } from '@/store/auth.store';
import ConfigGeneralePage from './ConfigGeneralePage';

const config: AppConfig = {
  generale: {
    matriculeExterneActif: false, matriculeRegex: '^EBN[0-9]+$',
    dureeSectionHeures: 8, delaiRetourJours: 14, fraisRetourPct: 7.5,
    smsApiKey: 'synthetic-api-key', smsUsername: 'synthetic-account', smsSenderId: 'EBN',
    kpayAutoPayoutActif: false, kpayAutoPayoutProvider: 'AIRTEL_COD',
    kpayAutoPayoutPhone: '243812345678', kpayAdminMpesaPhone: '243812345679',
    kpayAdminAirtelPhone: '243812345680', kpayAdminOrangePhone: '243812345681',
  },
  fidelite: { ratioPtsCDF: 1000, dureeValiditeMois: 12, cumulRemises: false, niveaux: [{ nom: 'Bronze', seuilPts: 0, remisePct: 0 }] },
  parrainage: { multiNiveaux: false, typeRecompense: 'POINTS', valeurNiveau1: 25, valeurNiveau2: 3, conditionDeclenchement: 'ACTIVATION', plafondMensuel: null },
};

const stats: SystemStats = {
  clients: { total: 25, actifs: 20, enCours: 5 },
  utilisateurs: { total: 8, actifs: 7, inactifs: 1 },
  sites: { total: 3, actifs: 2, inactifs: 1 },
  stocks: { totalProduits: 40, alertes: 2, ruptures: 1 },
  ventes: { aujourdhui: { count: 4, montant: 125.5 }, mois: { count: 12, montant: 800.25 } },
  parrainage: { total: 6 },
  systeme: { nodeVersion: 'v22.10.0', uptime: 90061, memoire: 64, environnement: 'production', smsConfigured: true },
};

let queryClient: QueryClient;
let configError: unknown;
let statsError: unknown;

beforeEach(() => {
  configError = undefined;
  statsError = undefined;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 'synthetic-admin', name: 'Admin Test', role: 'SUPER_ADMIN', siteId: null }, isAuthenticated: true });
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/config') {
      if (configError) throw configError;
      return { data: config };
    }
    if (url === '/config/system-stats') {
      if (statsError) throw statsError;
      return { data: stats };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.spyOn(api, 'patch').mockResolvedValue({ data: { success: true } });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, message: 'SMS de test accepté.' } });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  useAuthStore.setState({ user: null, isAuthenticated: false });
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/general']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ConfigGeneralePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openSection(name: string) {
  const navigation = within(screen.getByRole('navigation', { name: 'Sections configuration' }));
  await userEvent.click(navigation.getByRole('button', { name: name.startsWith('SMS') ? /SMS/ : name }));
}

describe('configuration générale', () => {
  it('exposes one pressed-button navigation for the four reachable sections', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    const navigation = within(screen.getByRole('navigation', { name: 'Sections configuration' }));
    expect(navigation.getAllByRole('button')).toHaveLength(4);
    expect(navigation.getByRole('button', { name: 'Vue système' })).toHaveAttribute('aria-pressed', 'true');
    await openSection('SMS & notifications');
    expect(navigation.getByRole('button', { name: 'SMS & notifications' })).toHaveAttribute('aria-pressed', 'true');
    expect(navigation.getByRole('button', { name: 'Vue système' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('heading', { name: 'Santé du serveur' })).not.toBeInTheDocument();
    await openSection('Opérations');
    expect(screen.getByRole('spinbutton', { name: /Durée.*session/ })).toHaveValue(8);
    await openSection('Parrainage');
    expect(screen.getByRole('spinbutton', { name: /Niveau 1/ })).toHaveValue(25);
    expect(navigation.queryByRole('button', { name: /fidélité/i })).not.toBeInTheDocument();
  });

  it('keeps credentials masked and sends only the three SMS settings', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    await openSection('SMS & notifications');
    const key = screen.getByLabelText(/Clé API|API Key/);
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveValue('synthetic-api-key');
    const reveal = screen.getByRole('button', { name: 'Afficher la clé API' });
    expect(reveal.tabIndex).toBeGreaterThanOrEqual(0);
    await userEvent.click(reveal);
    expect(key).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Masquer la clé API' }));
    expect(key).toHaveAttribute('type', 'password');
    await userEvent.clear(screen.getByLabelText(/Identifiant expéditeur|Sender ID/));
    await userEvent.type(screen.getByLabelText(/Identifiant expéditeur|Sender ID/), 'EBNTest');
    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/config', {
      generale: { smsApiKey: 'synthetic-api-key', smsUsername: 'synthetic-account', smsSenderId: 'EBNTest' },
    }));
    expect(api.post).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Configuration SMS sauvegardée');
  });

  it('explains an invalid sender identifier without saving', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    await openSection('SMS & notifications');
    const sender = screen.getByLabelText(/Identifiant expéditeur|Sender ID/);
    await userEvent.type(sender, 'TOO-LONG-SENDER');
    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    expect(await screen.findByText('Max 11 caractères')).toBeInTheDocument();
    expect(sender).toHaveAttribute('aria-invalid', 'true');
    expect(sender).toHaveAccessibleDescription(/Max 11 caractères/);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('sends the labelled SMS test number only on an explicit test action', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    await openSection('SMS & notifications');
    const phone = screen.getByLabelText('Numéro pour test SMS');
    expect((phone as HTMLInputElement).labels?.length).toBe(1);
    expect(screen.getByRole('button', { name: 'Tester' })).toBeDisabled();
    await userEvent.type(phone, '+243900000001');
    expect(api.post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Tester' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/config/test-sms', { phone: '+243900000001' }));
    expect(await screen.findByRole('status')).toHaveTextContent('SMS de test accepté.');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le résultat du test' }));
    expect(screen.queryByText('SMS de test accepté.')).not.toBeInTheDocument();
  });

  it('saves operational numbers and all existing KPay destinations without changing unrelated settings', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    await openSection('Opérations');
    const sessions = within(screen.getByRole('group', { name: 'Sessions et retours' }));
    await userEvent.clear(sessions.getByLabelText(/Durée.*session/));
    await userEvent.type(sessions.getByLabelText(/Durée.*session/), '12');
    await userEvent.click(screen.getByRole('switch', { name: 'Activer le matricule externe' }));
    expect(screen.getByLabelText(/Regex de validation/)).toHaveValue('^EBN[0-9]+$');
    await userEvent.click(screen.getByRole('switch', { name: 'Transférer automatiquement les encaissements' }));
    await userEvent.selectOptions(screen.getByLabelText('Opérateur administrateur'), 'ORANGE_COD');
    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/config', { generale: {
      dureeSectionHeures: 12, delaiRetourJours: 14, fraisRetourPct: 7.5,
      matriculeExterneActif: true, matriculeRegex: '^EBN[0-9]+$',
      kpayAutoPayoutActif: true, kpayAutoPayoutProvider: 'ORANGE_COD',
      kpayAutoPayoutPhone: '243812345678', kpayAdminMpesaPhone: '243812345679',
      kpayAdminAirtelPhone: '243812345680', kpayAdminOrangePhone: '243812345681',
    } }));
  });

  it('retains entered operational values when saving fails', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('Échec sauvegarde'));
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    await openSection('Opérations');
    const sessions = within(screen.getByRole('group', { name: 'Sessions et retours' }));
    await userEvent.clear(sessions.getByLabelText(/Délai.*retour/));
    await userEvent.type(sessions.getByLabelText(/Délai.*retour/), '21');
    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(sessions.getByLabelText(/Délai.*retour/)).toHaveValue(21);
    expect(screen.getByRole('button', { name: 'Sauvegarder' })).toBeEnabled();
  });

  it('uses labelled reward groups and preserves the commission payload in CDF', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    await openSection('Parrainage');
    const rewards = within(screen.getByRole('group', { name: 'Type de récompense' }));
    await userEvent.click(rewards.getByRole('radio', { name: /Commission CDF/ }));
    await userEvent.clear(screen.getByLabelText(/Niveau 1/));
    await userEvent.type(screen.getByLabelText(/Niveau 1/), '1750');
    await userEvent.click(screen.getByRole('switch', { name: 'Parrainage multi-niveaux' }));
    await userEvent.clear(screen.getByLabelText(/Niveau 2/));
    await userEvent.type(screen.getByLabelText(/Niveau 2/), '500');
    await userEvent.type(screen.getByLabelText(/Plafond mensuel/), '9000');
    const trigger = within(screen.getByRole('group', { name: 'Déclenchement de la récompense' }));
    await userEvent.click(trigger.getByRole('radio', { name: /Premier achat/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/config', { parrainage: {
      multiNiveaux: true, typeRecompense: 'COMMISSION_CDF', valeurNiveau1: 1750,
      valeurNiveau2: 500, conditionDeclenchement: 'PREMIER_ACHAT', plafondMensuel: 9000,
    } }));
  });

  it('labels server metric units without changing financial values', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    expect(screen.getByText('Mémoire utilisée').parentElement).toHaveTextContent('64 Mio');
    expect(screen.getByText('Durée de fonctionnement').parentElement).toHaveTextContent('1 j 1 h 1 min');
    expect(screen.getByText('Ventes ce mois').parentElement).toHaveTextContent(/12 ventes.*800[.,]25/);
    expect(screen.getByRole('link', { name: /Voir.*alertes/ })).toHaveAttribute('href', '/stocks/alerts');
  });

  it('provides a retry when system metrics are unavailable', async () => {
    statsError = new Error('Indisponible');
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Les métriques système sont indisponibles');
    statsError = undefined;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer les métriques' }));
    expect(await screen.findByRole('heading', { name: 'Santé du serveur' })).toBeInTheDocument();
  });

  it('hides retained system metrics after a forbidden refresh', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    statsError = { response: { status: 403 } };
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Les métriques système sont indisponibles');
    expect(screen.queryByText('v22.10.0')).not.toBeInTheDocument();
    expect(screen.queryByText('Clients actifs')).not.toBeInTheDocument();
  });

  it('hides retained configuration after a forbidden refresh', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Santé du serveur' });
    await openSection('SMS & notifications');
    expect(screen.getByLabelText(/Clé API|API Key/)).toHaveValue('synthetic-api-key');
    configError = { response: { status: 403 } };
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la configuration');
    expect(screen.queryByDisplayValue('synthetic-api-key')).not.toBeInTheDocument();
  });
});
