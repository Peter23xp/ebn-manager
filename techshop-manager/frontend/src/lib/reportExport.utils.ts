import { isAxiosError } from 'axios';
import type { ExportType } from './reports.api';

export const MAX_EXPORT_ROWS = 10_000;
export const REPORT_FILTER_KEYS = ['siteId', 'dateDebut', 'dateFin', 'modePaiement', 'agentId', 'categorie', 'search', 'statut', 'sortDir'] as const;
export type ReportFilters = Partial<Record<typeof REPORT_FILTER_KEYS[number], string>>;

const supportedFilters: Record<ExportType, readonly string[]> = {
  VENTES: ['siteId', 'dateDebut', 'dateFin', 'modePaiement', 'agentId', 'categorie', 'search', 'sortDir'],
  VENTES_DETAIL: ['siteId', 'dateDebut', 'dateFin', 'modePaiement', 'agentId', 'categorie', 'search', 'sortDir'],
  STOCKS: ['siteId', 'categorie', 'search'],
  CLIENTS: ['siteId', 'dateDebut', 'dateFin', 'statut', 'search'],
};

export function readReportFilters(params: URLSearchParams): ReportFilters {
  return Object.fromEntries(REPORT_FILTER_KEYS.flatMap(key => params.get(key) ? [[key, params.get(key)!]] : []));
}

export function exportFilters(type: ExportType, filters: ReportFilters): ReportFilters {
  return Object.fromEntries(Object.entries(filters).filter(([key, value]) => supportedFilters[type].includes(key) && value));
}

export function reportExportUrl(type: ExportType, filters: ReportFilters): string {
  const params = new URLSearchParams({ type, ...exportFilters(type, filters) });
  return `/reports/export?${params}`;
}

export function reportErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.every(item => typeof item === 'string')) return message.join(' ');
  }
  return error instanceof Error ? error.message : fallback;
}

export async function downloadErrorMessage(error: unknown): Promise<string> {
  if (isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const body = JSON.parse(await error.response.data.text());
      if (typeof body.message === 'string') return body.message;
      if (Array.isArray(body.message)) return body.message.join(' ');
    } catch {
      return 'Impossible de télécharger le fichier. Réessayez ou générez un nouvel export.';
    }
  }
  return reportErrorMessage(error, 'Impossible de télécharger le fichier.');
}

export function saveExportBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = fileName.replace(/[\\/\u0000-\u001f]/g, '_');
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
