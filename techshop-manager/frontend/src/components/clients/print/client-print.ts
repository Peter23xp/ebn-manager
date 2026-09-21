import { api } from '@/lib/api';
import type { ClientQueryParams, ClientRow } from '@/lib/clients.api';
import type { PaginatedResponse, StatutClient } from '@/types';

export const CLIENT_PRINT_MAX_ROWS = 1000;
export type ClientPrintMode = 'page' | 'all';
export interface ClientPrintSnapshot {
  filters: Readonly<ClientQueryParams>;
  siteLabel: string;
  isCurrent: () => boolean;
}

export const CLIENT_PRINT_STATUS: Record<StatutClient, string> = {
  ACTIF: 'Actif', EN_COURS: 'En cours', SUSPENDU: 'Suspendu', ARCHIVE: 'Archivé',
};

export class ClientPrintError extends Error {}

export async function loadClientPrintRows({
  filters, mode, signal, isCurrent, onProgress,
}: {
  filters: Readonly<ClientQueryParams>;
  mode: ClientPrintMode;
  signal: AbortSignal;
  isCurrent: () => boolean;
  onProgress: (loaded: number, total: number) => void;
}): Promise<ClientRow[]> {
  const frozen = { ...filters };
  const limit = mode === 'all' ? 100 : frozen.limit ?? 25;
  let page = mode === 'all' ? 1 : frozen.page ?? 1;
  const rows: ClientRow[] = [];
  const ids = new Set<string>();
  let expectedTotal: number | undefined;
  const assertCurrent = () => {
    if (signal.aborted || !isCurrent()) throw new DOMException('Impression annulée', 'AbortError');
  };
  const inconsistent = () => new ClientPrintError('La liste a changé pendant le chargement. Relancez l’aperçu.');

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > CLIENT_PRINT_MAX_ROWS || !Number.isSafeInteger(page) || page < 1) throw inconsistent();

  while (true) {
    assertCurrent();
    const response = await api.get<PaginatedResponse<ClientRow>>('/clients', {
      params: { ...frozen, page, limit }, signal,
    });
    assertCurrent();
    const { data, meta } = response.data;
    if (!meta || !Array.isArray(data) || !Number.isSafeInteger(meta.total) || meta.total < 0) throw inconsistent();
    if ((mode === 'all' && meta.total > CLIENT_PRINT_MAX_ROWS) || rows.length + data.length > CLIENT_PRINT_MAX_ROWS) {
      throw new ClientPrintError(`La limite est de ${CLIENT_PRINT_MAX_ROWS.toLocaleString('fr')} clients. Affinez les filtres ou imprimez la page courante.`);
    }
    if (meta.page !== page || meta.limit !== limit || meta.totalPages !== Math.ceil(meta.total / limit)
      || (expectedTotal !== undefined && meta.total !== expectedTotal)
      || data.length !== Math.min(limit, Math.max(0, meta.total - (page - 1) * limit))) throw inconsistent();
    expectedTotal = meta.total;
    for (const client of data) {
      if (!client.id || ids.has(client.id)) throw inconsistent();
      if (frozen.siteId && client.site?.id !== frozen.siteId) {
        throw new ClientPrintError('Un résultat ne correspond pas au site autorisé. Relancez la liste des clients.');
      }
      if (frozen.statut && client.statut !== frozen.statut) {
        throw new ClientPrintError('Un résultat ne correspond pas aux filtres figés. Relancez l’aperçu.');
      }
      ids.add(client.id);
      rows.push(client);
    }
    onProgress(rows.length, mode === 'all' ? meta.total : data.length);
    assertCurrent();
    if (mode === 'page' || page >= meta.totalPages) return rows;
    page += 1;
  }
}
