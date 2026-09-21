import { describe, expect, it } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { buildExportFile, normalizeExport, resolveExportScope } from './export.helpers';

describe('Export validation and trusted scope', () => {
  it.each(['VENTES', 'VENTES_DETAIL', 'STOCKS', 'CLIENTS'])('accepts %s in CSV and XLSX', type => {
    for (const format of ['CSV', 'XLSX']) {
      expect(normalizeExport({ type, format })).toMatchObject({ type, format, filtres: {} });
    }
  });

  it.each([
    null, [], {}, { type: 'FIDELITE', format: 'CSV' }, { type: 'PARRAINAGE', format: 'CSV' },
    { type: 'VENTES', format: 'PDF' }, { type: 'VENTES', format: 'CSV', ownerId: 'forged' },
    { type: 'VENTES', format: 'CSV', filtres: [] },
    { type: 'VENTES', format: 'CSV', filtres: { scopeRole: 'SUPER_ADMIN' } },
    { type: 'VENTES', format: 'CSV', filtres: { siteId: ['site'] } },
    { type: 'VENTES', format: 'CSV', filtres: { dateDebut: '2026-02-30' } },
    { type: 'VENTES', format: 'CSV', filtres: { dateDebut: '2026-02-30T12:00:00Z' } },
    { type: 'VENTES', format: 'CSV', filtres: { dateDebut: '09/21/2026' } },
    { type: 'VENTES', format: 'CSV', filtres: { dateFin: '2026-09-21T12:00:00' } },
    { type: 'VENTES', format: 'CSV', filtres: { dateDebut: '2026-09-22', dateFin: '2026-09-21' } },
    { type: 'VENTES', format: 'CSV', filtres: { modePaiement: 'INVALID' } },
    { type: 'VENTES', format: 'CSV', filtres: { statut: 'ANNULEE' } },
    { type: 'VENTES', format: 'CSV', filtres: { sortDir: 'invalid' } },
    { type: 'STOCKS', format: 'CSV', filtres: { dateFin: '2026-09-21' } },
    { type: 'CLIENTS', format: 'CSV', filtres: { statut: 'INVALID' } },
    { type: 'CLIENTS', format: 'CSV', filtres: { search: 'x'.repeat(201) } },
  ])('rejects invalid or unsupported input %j', input => {
    expect(() => normalizeExport(input)).toThrow(BadRequestException);
  });

  it('expands datepicker end dates to the inclusive UTC day, preserving explicit instants', () => {
    expect(normalizeExport({ type: 'VENTES', format: 'CSV', filtres: {
      dateDebut: '2026-09-21', dateFin: '2026-09-21',
    } }).filtres).toEqual({ dateDebut: '2026-09-21T00:00:00.000Z', dateFin: '2026-09-21T23:59:59.999Z' });
    expect(normalizeExport({ type: 'CLIENTS', format: 'XLSX', filtres: {
      dateFin: '2026-09-21T15:12:00+02:00',
    } }).filtres.dateFin).toBe('2026-09-21T13:12:00.000Z');
  });

  it('accepts stock search and sales sort direction', () => {
    expect(normalizeExport({ type: 'STOCKS', format: 'CSV', filtres: { search: 'Téléphone' } }).filtres.search).toBe('Téléphone');
    expect(normalizeExport({ type: 'VENTES_DETAIL', format: 'CSV', filtres: { sortDir: 'desc' } }).filtres.sortDir).toBe('desc');
  });

  it('derives GERANT scope from the authenticated actor, never from filters', () => {
    expect(resolveExportScope({ id: 'owner', role: Role.GERANT, siteId: 'site-a' })).toEqual({
      ownerId: 'owner', scopeRole: Role.GERANT, scopeActorSiteId: 'site-a', scopeSiteId: 'site-a',
    });
    expect(() => resolveExportScope({ id: 'owner', role: Role.GERANT, siteId: 'site-a' }, 'site-b')).toThrow(ForbiddenException);
  });

  it.each([undefined, null, ''])('denies a GERANT without an assigned site (%s)', siteId => {
    expect(() => resolveExportScope({ id: 'owner', role: Role.GERANT, siteId })).toThrow(ForbiddenException);
  });

  it.each([Role.AGENT, Role.CAISSIER, Role.CLIENT, Role.FORMATEUR])('denies %s', role => {
    expect(() => resolveExportScope({ id: 'owner', role, siteId: 'site-a' })).toThrow(ForbiddenException);
  });

  it.each([Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('honors the requested site for %s', role => {
    expect(resolveExportScope({ id: 'owner', role, siteId: 'site-a' }, 'site-b').scopeSiteId).toBe('site-b');
    expect(resolveExportScope({ id: 'owner', role }).scopeSiteId).toBeNull();
  });
});

describe('Real spreadsheet files', () => {
  it('writes UTF-8 BOM CSV with quoted delimiters, quotes and multiline text', async () => {
    const bytes = await buildExportFile('CSV', ['Nom', 'Montant'], [['Élodie; "Client"', 12.5], ['ligne\nsuivante', 0]]);
    expect(bytes.toString('utf8')).toBe('\uFEFF"Nom";"Montant"\r\n"Élodie; ""Client""";"12.5"\r\n"\'ligne\nsuivante";"0"\r\n');
  });

  it.each(['=HYPERLINK("https://evil")', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', '\n=1', '  =1', 'safe\t=1'])('neutralizes spreadsheet injection %j', async value => {
    expect((await buildExportFile('CSV', ['Texte'], [[value]])).toString()).toContain(`"'${value.replace(/"/g, '""')}"`);
  });

  it('writes an actual XLSX with text cells, not executable formulas', async () => {
    const bytes = await buildExportFile('XLSX', ['Client', 'Montant'], [['=1+1', 12.5], ['\t=1', 0]]);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('A2').value).toBe('=1+1');
    expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('B2').value).toBe(12.5);
    expect(sheet.rowCount).toBe(3);
  });

  it('exports empty datasets with real headers', async () => {
    expect((await buildExportFile('CSV', ['Client'], [])).toString()).toBe('\uFEFF"Client"\r\n');
  });

  it('rejects oversized cells rather than silently truncating data', async () => {
    await expect(buildExportFile('XLSX', ['Client'], [['x'.repeat(32768)]])).rejects.toThrow(BadRequestException);
  });

  it('rejects exports exceeding the database byte bound', async () => {
    await expect(buildExportFile('CSV', ['Client'], Array.from({ length: 200 }, () => ['x'.repeat(30000)]))).rejects.toThrow(BadRequestException);
  });

  it('rejects more than 10000 rows at the serializer boundary', async () => {
    await expect(buildExportFile('CSV', ['Client'], Array.from({ length: 10001 }, () => ['client']))).rejects.toThrow(BadRequestException);
  });
});
