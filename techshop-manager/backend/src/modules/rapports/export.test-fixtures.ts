import { jest } from '@jest/globals';
import { Prisma, Role } from '@prisma/client';
import { StaffActor } from '../../common/access/staff-access';

export const exportActor: StaffActor = { id: 'owner', role: Role.GERANT, siteId: 'site-a' };

export function saleFixture(id = 'sale-a', overrides: Record<string, unknown> = {}) {
  return {
    id, numeroVente: id, siteId: 'site-a', agentId: 'agent-a', clientId: 'client-a',
    statut: 'VALIDE', createdAt: new Date('2026-09-21T23:59:59.999Z'),
    modePaiement: 'CASH', montantBrut: new Prisma.Decimal('15.50'),
    remiseFidelite: new Prisma.Decimal('1.00'), remiseParrainage: new Prisma.Decimal('2.00'),
    montantNet: new Prisma.Decimal('12.50'),
    site: { nom: 'Lubumbashi' }, agent: { nom: 'Vendeur' },
    client: { nom: 'Client local', prenom: 'Anne', siteInscriptionId: 'site-a' },
    lignes: [{ produit: { categorie: 'Téléphones' } }],
    ...overrides,
  };
}

export function jobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-existing', type: 'VENTES', format: 'CSV', filtres: {},
    ownerId: 'owner', scopeRole: Role.GERANT, scopeActorSiteId: 'site-a', scopeSiteId: 'site-a',
    statut: 'READY', fileBytes: Buffer.from('private'), fileName: 'ventes.csv',
    mimeType: 'text/csv; charset=utf-8', fileSize: 7, rowCount: 1,
    downloadUrl: null, errorMsg: null, createdAt: new Date(), updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000), ...overrides,
  };
}

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([key, expected]: [string, any]) => {
    if (expected === undefined) return true;
    if (key === 'OR') return expected.some((clause: any) => matches(row, clause));
    if (key === 'AND') return (Array.isArray(expected) ? expected : [expected]).every((clause: any) => matches(row, clause));
    const value = row?.[key];
    if (expected === null || typeof expected !== 'object' || expected instanceof Date) return value === expected;
    if ('some' in expected) return value?.some((item: any) => matches(item, expected.some));
    if ('in' in expected && !expected.in.includes(value)) return false;
    if ('not' in expected && value === expected.not) return false;
    if ('gt' in expected && !(value > expected.gt)) return false;
    if ('gte' in expected && !(value >= expected.gte)) return false;
    if ('lte' in expected && !(value <= expected.lte)) return false;
    if ('contains' in expected && !String(value ?? '').toLowerCase().includes(expected.contains.toLowerCase())) return false;
    const relationKeys = Object.keys(expected).filter(field => !['in', 'not', 'gt', 'gte', 'lte', 'contains', 'mode'].includes(field));
    return relationKeys.every(field => matches(value, { [field]: expected[field] }));
  });
}

function project(row: any, select: any): any {
  if (!row || !select) return row;
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]: [string, any]) => [
    key, value === true ? row[key] : project(row[key], value.select),
  ]));
}

export function exportPrismaFixture() {
  const jobs: any[] = [];
  const sales: any[] = [
    saleFixture(), saleFixture('anonymous', { clientId: null, client: null }),
    saleFixture('foreign-client', { client: { nom: 'Confidentiel', siteInscriptionId: 'site-b' } }),
    saleFixture('foreign-sale', { siteId: 'site-b' }),
    saleFixture('unpaid', { statut: 'EN_ATTENTE_PAIEMENT' }),
    saleFixture('cancelled', { statut: 'ANNULEE' }),
    saleFixture('next-day', { createdAt: new Date('2026-09-22T00:00:00.000Z') }),
  ];
  const product = { nom: 'Téléphone', sku: 'SKU-1', categorie: 'Téléphones', prixVente: new Prisma.Decimal(20), prixAchat: new Prisma.Decimal(10) };
  const lines: any[] = [
    { id: 'line-a', vente: sales[0], produit: product, quantite: 2, prixUnitaire: new Prisma.Decimal(7.75), sousTotal: new Prisma.Decimal(15.5) },
    { id: 'line-b', vente: sales[0], produit: { ...product, sku: 'SKU-2', categorie: 'Accessoires' }, quantite: 1, prixUnitaire: new Prisma.Decimal(5), sousTotal: new Prisma.Decimal(5) },
    { id: 'line-foreign', vente: sales[2], produit: product, quantite: 1, prixUnitaire: new Prisma.Decimal(5), sousTotal: new Prisma.Decimal(5) },
  ];
  const stocks: any[] = [
    { id: 'stock-a', siteId: 'site-a', site: { nom: 'Lubumbashi' }, produit: product, quantite: 3, seuilAlerte: 5, updatedAt: new Date('2026-09-20') },
    { id: 'stock-b', siteId: 'site-b', site: { nom: 'Kinshasa' }, produit: product, quantite: 9, seuilAlerte: 2, updatedAt: new Date('2026-09-20') },
  ];
  const clients: any[] = [
    { id: 'client-a', matriculeExterne: 'EXTERNAL-1', codeParrain: 'PAR-1', membre: { matricule: 'MAT-1' }, nom: 'Client local', prenom: 'Anne', telephone: '+243000000001', statut: 'ACTIF', siteInscriptionId: 'site-a', siteInscription: { nom: 'Lubumbashi' }, createdAt: new Date('2026-09-21') },
    { id: 'client-b', matriculeExterne: null, nom: 'Confidentiel', prenom: 'Autre', telephone: '+243000000002', statut: 'EN_COURS', siteInscriptionId: 'site-b', siteInscription: { nom: 'Kinshasa' }, createdAt: new Date('2026-09-21') },
  ];
  function delegate(rows: any[]) {
    return {
      count: jest.fn<(query?: any) => Promise<number>>(async ({ where } = {}) => rows.filter(row => matches(row, where)).length),
      findMany: jest.fn<(query?: any) => Promise<any[]>>(async ({ where, select, take, skip = 0, orderBy } = {}) => {
        const selected = rows.filter(row => matches(row, where));
        if (orderBy) selected.sort((left, right) => {
          for (const order of Array.isArray(orderBy) ? orderBy : [orderBy]) {
            const [field, direction] = Object.entries(order)[0];
            const leftValue = left[field];
            const rightValue = right[field];
            const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
            if (comparison) return direction === 'desc' ? -comparison : comparison;
          }
          return 0;
        });
        return selected.slice(skip, take === undefined ? undefined : skip + take).map(row => project(row, select));
      }),
    };
  }
  const prisma = {
    vente: delegate(sales), ligneVente: delegate(lines), stockSite: delegate(stocks), client: delegate(clients),
    exportJob: {
      ...delegate(jobs),
      create: jest.fn<any>(async ({ data }) => {
        const job = jobFixture({ id: `job-${jobs.length + 1}`, fileBytes: null, fileName: null, mimeType: null, fileSize: null, rowCount: null, ...data });
        jobs.push(job);
        return job;
      }),
      findUnique: jest.fn<(query: any) => Promise<any>>(async ({ where, select }) => project(jobs.find(job => job.id === where.id) ?? null, select)),
      updateMany: jest.fn<any>(async ({ where, data }) => {
        const selected = jobs.filter(job => matches(job, where));
        selected.forEach(job => Object.assign(job, data, { updatedAt: new Date() }));
        return { count: selected.length };
      }),
    },
    $transaction: jest.fn<(callback: any, options?: any) => Promise<any>>(),
  };
  prisma.$transaction.mockImplementation(async callback => callback(prisma));
  async function settled(jobId: string) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const job = jobs.find(item => item.id === jobId);
      if (job?.statut !== 'PENDING') return job;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Export did not settle');
  }
  return { prisma, jobs, sales, lines, stocks, clients, settled };
}
