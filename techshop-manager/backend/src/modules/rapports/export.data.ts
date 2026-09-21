import { BadRequestException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import {
  assertExportByteLimit, assertExportRowLimit, EXPORT_PAGE_SIZE, ExportCell,
  ExportFilters, ExportRequest, ExportScope, exportRowBytes, ExportType,
} from './export.helpers';

const headers: Record<ExportType, string[]> = {
  VENTES: ['N° vente', 'Date (UTC)', 'Site', 'Agent', 'Client', 'Statut', 'Mode de paiement', 'Montant brut initial (USD)', 'Remise fidélité (USD)', 'Remise parrainage (USD)', 'Montant net initial (USD, hors remboursements)'],
  VENTES_DETAIL: ['N° vente', 'Date (UTC)', 'Site', 'Agent', 'Client', 'Statut', 'Mode de paiement', 'SKU', 'Produit', 'Catégorie', 'Quantité initiale', 'Prix unitaire initial (USD)', 'Sous-total initial (USD, avant remises et retours)'],
  STOCKS: ['Site', 'SKU', 'Produit', 'Catégorie', 'Quantité', 'Seuil d’alerte', 'Prix d’achat (USD)', 'Prix de vente (USD)', 'Dernière mise à jour (UTC)'],
  CLIENTS: ['Matricule', 'Prénom', 'Nom', 'Téléphone', 'Site d’inscription', 'Statut', 'Date d’inscription (UTC)'],
};

const saleSelect = {
  id: true, numeroVente: true, createdAt: true, statut: true, modePaiement: true,
  site: { select: { nom: true } }, agent: { select: { nom: true } },
  client: { select: { nom: true, prenom: true } },
} satisfies Prisma.VenteSelect;

function dateWhere(filters: ExportFilters): Prisma.DateTimeFilter | undefined {
  if (!filters.dateDebut && !filters.dateFin) return undefined;
  return {
    ...(filters.dateDebut ? { gte: new Date(filters.dateDebut) } : {}),
    ...(filters.dateFin ? { lte: new Date(filters.dateFin) } : {}),
  };
}

function salesWhere(filters: ExportFilters, scope: ExportScope): Prisma.VenteWhereInput {
  const clauses: Prisma.VenteWhereInput[] = [];
  if (scope.scopeRole === Role.GERANT) {
    clauses.push({ OR: [{ clientId: null }, { client: { siteInscriptionId: scope.scopeSiteId } }] });
  }
  if (filters.search) {
    const text: Prisma.StringFilter = { contains: filters.search, mode: 'insensitive' };
    clauses.push({ OR: [{ numeroVente: text }, { client: { nom: text } }, { client: { prenom: text } }] });
  }
  return {
    statut: { in: ['VALIDE', 'RETOURNEE_PARTIELLE', 'RETOURNEE'] },
    ...(scope.scopeSiteId ? { siteId: scope.scopeSiteId } : {}),
    createdAt: dateWhere(filters), agentId: filters.agentId, modePaiement: filters.modePaiement,
    ...(filters.categorie ? { lignes: { some: { produit: { categorie: filters.categorie } } } } : {}),
    ...(clauses.length ? { AND: clauses } : {}),
  };
}

function linesWhere(filters: ExportFilters, scope: ExportScope): Prisma.LigneVenteWhereInput {
  return {
    vente: salesWhere(filters, scope),
    ...(filters.categorie ? { produit: { categorie: filters.categorie } } : {}),
  };
}

function stockWhere(filters: ExportFilters, scope: ExportScope): Prisma.StockSiteWhereInput {
  const text: Prisma.StringFilter = { contains: filters.search, mode: 'insensitive' };
  return {
    ...(scope.scopeSiteId ? { siteId: scope.scopeSiteId } : {}),
    produit: {
      categorie: filters.categorie,
      ...(filters.search ? { OR: [{ nom: text }, { sku: text }] } : {}),
    },
  };
}

function clientsWhere(filters: ExportFilters, scope: ExportScope): Prisma.ClientWhereInput {
  const text: Prisma.StringFilter = { contains: filters.search, mode: 'insensitive' };
  return {
    ...(scope.scopeSiteId ? { siteInscriptionId: scope.scopeSiteId } : {}),
    createdAt: dateWhere(filters), statut: filters.statut,
    ...(filters.search ? { OR: [{ nom: text }, { prenom: text }, { telephone: text }, { codeParrain: text }, { membre: { matricule: text } }] } : {}),
  };
}

export async function countExportRows(database: Prisma.TransactionClient, request: ExportRequest, scope: ExportScope): Promise<number> {
  switch (request.type) {
    case 'VENTES': return database.vente.count({ where: salesWhere(request.filtres, scope) });
    case 'VENTES_DETAIL': return database.ligneVente.count({ where: linesWhere(request.filtres, scope) });
    case 'STOCKS': return database.stockSite.count({ where: stockWhere(request.filtres, scope) });
    case 'CLIENTS': return database.client.count({ where: clientsWhere(request.filtres, scope) });
  }
}

function saleCells(sale: Prisma.VenteGetPayload<{ select: typeof saleSelect }>): ExportCell[] {
  return [sale.numeroVente, sale.createdAt.toISOString(), sale.site.nom, sale.agent.nom,
    sale.client ? `${sale.client.prenom} ${sale.client.nom}` : '', sale.statut, sale.modePaiement];
}

async function readPage(database: Prisma.TransactionClient, request: ExportRequest, scope: ExportScope, lastId: string | undefined, offset: number) {
  const filters = request.filtres;
  const sortedSales = filters.sortDir && ['VENTES', 'VENTES_DETAIL'].includes(request.type);
  const id = !sortedSales && lastId ? { gt: lastId } : undefined;
  const paging = { take: EXPORT_PAGE_SIZE, ...(sortedSales ? { skip: offset } : {}) };
  switch (request.type) {
    case 'VENTES': {
      const rows = await database.vente.findMany({
        where: { ...salesWhere(filters, scope), id }, ...paging,
        orderBy: sortedSales ? [{ createdAt: filters.sortDir }, { id: filters.sortDir }] : { id: 'asc' },
        select: { ...saleSelect, montantBrut: true, remiseFidelite: true, remiseParrainage: true, montantNet: true },
      });
      return rows.map(row => ({ id: row.id, cells: [...saleCells(row), Number(row.montantBrut), Number(row.remiseFidelite), Number(row.remiseParrainage), Number(row.montantNet)] }));
    }
    case 'VENTES_DETAIL': {
      const rows = await database.ligneVente.findMany({
        where: { ...linesWhere(filters, scope), id }, ...paging,
        orderBy: sortedSales ? [{ vente: { createdAt: filters.sortDir } }, { id: filters.sortDir }] : { id: 'asc' },
        select: {
          id: true, quantite: true, prixUnitaire: true, sousTotal: true,
          vente: { select: saleSelect }, produit: { select: { sku: true, nom: true, categorie: true } },
        },
      });
      return rows.map(row => ({ id: row.id, cells: [...saleCells(row.vente), row.produit.sku, row.produit.nom, row.produit.categorie, row.quantite, Number(row.prixUnitaire), Number(row.sousTotal)] }));
    }
    case 'STOCKS': {
      const rows = await database.stockSite.findMany({
        where: { ...stockWhere(filters, scope), id }, ...paging, orderBy: { id: 'asc' },
        select: {
          id: true, quantite: true, seuilAlerte: true, updatedAt: true, site: { select: { nom: true } },
          produit: { select: { sku: true, nom: true, categorie: true, prixAchat: true, prixVente: true } },
        },
      });
      return rows.map(row => ({ id: row.id, cells: [row.site.nom, row.produit.sku, row.produit.nom, row.produit.categorie, row.quantite, row.seuilAlerte, Number(row.produit.prixAchat), Number(row.produit.prixVente), row.updatedAt.toISOString()] }));
    }
    case 'CLIENTS': {
      const rows = await database.client.findMany({
        where: { ...clientsWhere(filters, scope), id }, ...paging, orderBy: { id: 'asc' },
        select: {
          id: true, codeParrain: true, membre: { select: { matricule: true } }, prenom: true, nom: true, telephone: true, statut: true,
          createdAt: true, siteInscription: { select: { nom: true } },
        },
      });
      return rows.map(row => ({ id: row.id, cells: [row.membre?.matricule || row.codeParrain || '', row.prenom, row.nom, row.telephone, row.siteInscription.nom, row.statut, row.createdAt.toISOString()] }));
    }
  }
}

export async function readExportData(database: Prisma.TransactionClient, request: ExportRequest, scope: ExportScope, deadline: Date) {
  assertExportRowLimit(await countExportRows(database, request, scope));
  const rows: ExportCell[][] = [];
  let lastId: string | undefined;
  let bytes = 0;
  while (true) {
    if (Date.now() >= deadline.getTime()) throw new BadRequestException('Le délai de génération de l’export est dépassé.');
    const page = await readPage(database, request, scope, lastId, rows.length);
    assertExportRowLimit(rows.length + page.length);
    for (const row of page) {
      bytes += exportRowBytes(row.cells);
      assertExportByteLimit(bytes);
      rows.push(row.cells);
    }
    if (page.length < EXPORT_PAGE_SIZE) break;
    lastId = page[page.length - 1].id;
  }
  return { headers: headers[request.type], rows };
}
