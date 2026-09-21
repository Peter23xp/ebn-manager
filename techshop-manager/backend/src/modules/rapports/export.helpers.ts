import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ModePaiement, Role, StatutClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { StaffActor } from '../../common/access/staff-access';

export const MAX_EXPORT_ROWS = 10_000;
export const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
export const EXPORT_PAGE_SIZE = 500;
export const EXPORT_PENDING_TTL_MS = 10 * 60 * 1000;
export const EXPORT_FILE_TTL_MS = 60 * 60 * 1000;
export type ExportType = 'VENTES' | 'VENTES_DETAIL' | 'STOCKS' | 'CLIENTS';
export type ExportFormat = 'CSV' | 'XLSX';
export type ExportCell = string | number;
export type ExportFilters = {
  siteId?: string;
  dateDebut?: string;
  dateFin?: string;
  agentId?: string;
  modePaiement?: ModePaiement;
  categorie?: string;
  statut?: StatutClient;
  search?: string;
  sortDir?: 'asc' | 'desc';
};
export type ExportRequest = { type: ExportType; format: ExportFormat; filtres: ExportFilters };
export type ExportScope = {
  ownerId: string;
  scopeRole: Role;
  scopeActorSiteId: string | null;
  scopeSiteId: string | null;
};

const allowedFilters: Record<ExportType, string[]> = {
  VENTES: ['siteId', 'dateDebut', 'dateFin', 'agentId', 'modePaiement', 'categorie', 'search', 'sortDir'],
  VENTES_DETAIL: ['siteId', 'dateDebut', 'dateFin', 'agentId', 'modePaiement', 'categorie', 'search', 'sortDir'],
  STOCKS: ['siteId', 'categorie', 'search'],
  CLIENTS: ['siteId', 'dateDebut', 'dateFin', 'statut', 'search'],
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizedDate(value: string, end: boolean): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const day = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  const date = new Date(dateOnly ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : value);
  if ((!dateOnly && !instant) || !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== value.slice(0, 10) || !Number.isFinite(date.getTime()) ||
    (instant && (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59))) {
    throw new BadRequestException('Date invalide : utilisez AAAA-MM-JJ ou une date ISO avec fuseau horaire.');
  }
  return date.toISOString();
}

export function normalizeExport(input: unknown): ExportRequest {
  if (!record(input) || Object.keys(input).some(key => !['type', 'format', 'filtres'].includes(key))) {
    throw new BadRequestException('Paramètres d’export invalides.');
  }
  if (typeof input.type !== 'string' || !Object.prototype.hasOwnProperty.call(allowedFilters, input.type)) {
    throw new BadRequestException('Type non pris en charge : VENTES, VENTES_DETAIL, STOCKS ou CLIENTS.');
  }
  if (input.format !== 'CSV' && input.format !== 'XLSX') {
    throw new BadRequestException('Format non pris en charge : choisissez CSV ou XLSX.');
  }
  const type = input.type as ExportType;
  const rawFilters = input.filtres === undefined ? {} : input.filtres;
  if (!record(rawFilters)) throw new BadRequestException('Les filtres doivent être un objet.');
  const filtres: ExportFilters = {};
  for (const [key, value] of Object.entries(rawFilters)) {
    if (!allowedFilters[type].includes(key)) throw new BadRequestException(`Filtre non pris en charge : ${key}.`);
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || value.length > 200 || /[\x00-\x1f]/.test(value)) {
      throw new BadRequestException(`Filtre invalide : ${key}.`);
    }
    if (!value.trim()) continue;
    filtres[key] = value.trim();
  }
  if (filtres.modePaiement && !Object.values(ModePaiement).includes(filtres.modePaiement)) {
    throw new BadRequestException('Mode de paiement invalide.');
  }
  if (filtres.statut && !Object.values(StatutClient).includes(filtres.statut)) {
    throw new BadRequestException('Statut client invalide.');
  }
  if (filtres.sortDir && !['asc', 'desc'].includes(filtres.sortDir)) {
    throw new BadRequestException('Ordre de tri invalide : choisissez asc ou desc.');
  }
  if (filtres.dateDebut) filtres.dateDebut = normalizedDate(filtres.dateDebut, false);
  if (filtres.dateFin) filtres.dateFin = normalizedDate(filtres.dateFin, true);
  if (filtres.dateDebut && filtres.dateFin && filtres.dateDebut > filtres.dateFin) {
    throw new BadRequestException('La date de début doit précéder la date de fin.');
  }
  return { type, format: input.format, filtres };
}

export function resolveExportScope(actor: StaffActor, requestedSiteId?: string): ExportScope {
  if (!actor?.id || ![Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN].includes(actor.role as never)) {
    throw new ForbiddenException('Votre rôle ne permet pas d’exporter ces données.');
  }
  if (actor.role === Role.GERANT && !actor.siteId?.trim()) {
    throw new ForbiddenException('Un site doit être attribué à votre compte.');
  }
  if (actor.role === Role.GERANT && requestedSiteId && requestedSiteId !== actor.siteId) {
    throw new ForbiddenException('Les exports sont réservés à votre site.');
  }
  return {
    ownerId: actor.id,
    scopeRole: actor.role,
    scopeActorSiteId: actor.siteId || null,
    scopeSiteId: actor.role === Role.GERANT ? actor.siteId : requestedSiteId || null,
  };
}

export function assertExportRowLimit(count: number): void {
  if (count > MAX_EXPORT_ROWS) {
    throw new BadRequestException('L’export dépasse 10 000 lignes. Réduisez la période ou les filtres.');
  }
}

export function exportRowBytes(row: ExportCell[]): number {
  return row.reduce<number>((total, cell) => {
    if (typeof cell === 'string' && cell.length > 32767) {
      throw new BadRequestException('Une cellule est trop longue pour être exportée sans perte.');
    }
    return total + Buffer.byteLength(String(cell), 'utf8') + 8;
  }, 0);
}

export function assertExportByteLimit(size: number): void {
  if (size > MAX_EXPORT_BYTES) {
    throw new BadRequestException('Le fichier dépasse 5 Mo. Réduisez les filtres de l’export.');
  }
}

function csvCell(value: ExportCell): string {
  const text = String(value);
  const safe = typeof value === 'string' && (/^[\s\uFEFF]*[=+\-@]/u.test(value) || /[\t\r\n]/.test(value)) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function buildExportFile(format: ExportFormat, headers: string[], rows: ExportCell[][]): Promise<Buffer> {
  assertExportRowLimit(rows.length);
  let size = exportRowBytes(headers);
  for (const row of rows) {
    size += exportRowBytes(row);
    assertExportByteLimit(size);
  }
  let bytes: Buffer;
  if (format === 'CSV') {
    bytes = Buffer.from(`\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')}\r\n`, 'utf8');
  } else {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rapport');
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.addRows(rows);
    bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  }
  assertExportByteLimit(bytes.length);
  return bytes;
}
