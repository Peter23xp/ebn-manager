import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, StatutVente } from '@prisma/client';
import { staffSalesWhere, StaffActor } from '../../common/access/staff-access';
import { reportPeriod, reportBuckets, reportBucketLabel } from './report-period';

const PAID_STATUSES: StatutVente[] = ['VALIDE', 'RETOURNEE_PARTIELLE', 'RETOURNEE'];
const money = (value: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(value ?? 0);
const amount = (value: Prisma.Decimal) => value.toDecimalPlaces(2).toNumber();

@Injectable()
export class RapportsService {
  constructor(private prisma: PrismaService) {}

  async getVentesDashboard(query: {
    siteId?: string;
    dateDebut: string;
    dateFin: string;
    granularite?: 'day' | 'week' | 'month';
  }, actor: StaffActor) {
    if (actor.role === 'GERANT' && !actor.siteId) {
      throw new ForbiddenException('Un site doit être attribué à votre compte pour consulter les rapports.');
    }
    const siteId = actor.role === 'GERANT' ? actor.siteId : query.siteId;
    const granularite = query.granularite ?? 'day';
    if (!['day', 'week', 'month'].includes(granularite)) {
      throw new BadRequestException('La granularité doit être jour, semaine ou mois.');
    }
    const dates = reportPeriod(query.dateDebut, query.dateFin);
    const siteWhere = siteId ? { siteId } : {};
    const clientWhere = siteId ? { siteInscriptionId: siteId } : {};
    const salesWhere: Prisma.VenteWhereInput = { ...siteWhere, createdAt: dates, statut: { in: PAID_STATUSES } };
    const [sites, sales, newClients, clientStatuses, activated, steps, refunds, pending, timeSeries, stocks, topLines] = await Promise.all([
      this.prisma.site.findMany({ where: siteId ? { id: siteId } : {}, select: { id: true, nom: true }, orderBy: { nom: 'asc' } }),
      this.prisma.vente.groupBy({
        by: ['siteId', 'modePaiement'], where: salesWhere, _count: { id: true },
        _sum: { montantNet: true, remiseFidelite: true, remiseParrainage: true },
      }),
      this.prisma.client.groupBy({ by: ['siteInscriptionId'], where: { ...clientWhere, createdAt: dates }, _count: { id: true } }),
      this.prisma.client.groupBy({ by: ['statut'], where: clientWhere, _count: { id: true } }),
      this.prisma.client.count({ where: { ...clientWhere, dateActivation: dates } }),
      this.prisma.onboardingEtape.groupBy({
        by: ['etape'], where: { ...siteWhere, statut: 'COMPLETE', completeeAt: dates },
        _count: { id: true }, _sum: { montant: true },
      }),
      this.prisma.retour.aggregate({
        where: {
          statut: 'COMPLETE', vente: siteWhere,
          OR: [
            { kpayTransactions: { some: {
              operationType: 'SALE_REFUND', status: 'COMPLETED',
              OR: [{ completedAt: dates }, { completedAt: null, terminalEventProcessedAt: dates }],
            } } },
            { createdAt: dates, kpayTransactions: { none: { operationType: 'SALE_REFUND' } } },
          ],
        },
        _count: { id: true }, _sum: { montantRembourse: true },
      }),
      this.prisma.vente.aggregate({
        where: { ...siteWhere, createdAt: dates, statut: 'EN_ATTENTE_PAIEMENT' },
        _count: { id: true }, _sum: { montantNet: true },
      }),
      this.prisma.$queryRaw<Array<{ bucket: Date; siteId: string; amount: Prisma.Decimal }>>(Prisma.sql`
        SELECT DATE_TRUNC(${granularite}::text, "createdAt") AS bucket, "siteId", SUM("montantNet") AS amount
        FROM ventes
        WHERE "createdAt" >= ${dates.gte} AND "createdAt" <= ${dates.lte}
          AND statut IN ('VALIDE', 'RETOURNEE_PARTIELLE', 'RETOURNEE')
          ${siteId ? Prisma.sql`AND "siteId" = ${siteId}` : Prisma.empty}
        GROUP BY bucket, "siteId" ORDER BY bucket
      `),
      this.prisma.$queryRaw<Array<{ siteId: string; references: number; units: number; alerts: number; value: Prisma.Decimal }>>(Prisma.sql`
        SELECT stock."siteId", COUNT(*)::int AS "references", COALESCE(SUM(stock.quantite), 0)::int AS units,
          COUNT(*) FILTER (WHERE stock.quantite <= stock."seuilAlerte")::int AS alerts,
          COALESCE(SUM(stock.quantite * produit."prixAchat"), 0) AS value
        FROM stock_sites stock JOIN produits produit ON produit.id = stock."produitId"
        ${siteId ? Prisma.sql`WHERE stock."siteId" = ${siteId}` : Prisma.empty}
        GROUP BY stock."siteId"
      `),
      this.prisma.ligneVente.groupBy({
        by: ['produitId'], where: { vente: salesWhere }, _sum: { quantite: true, sousTotal: true },
        orderBy: { _sum: { quantite: 'desc' } }, take: 5,
      }),
    ]);
    const products = await this.prisma.produit.findMany({
      where: { id: { in: topLines.map((line) => line.produitId) } }, select: { id: true, nom: true, sku: true },
    });
    const productsById = new Map(products.map((product) => [product.id, product]));
    const total = sales.reduce((sum, sale) => sum.plus(money(sale._sum.montantNet)), money(0));
    const nbVentes = sales.reduce((sum, sale) => sum + sale._count.id, 0);
    const discounts = sales.reduce((sum, sale) => sum.plus(money(sale._sum.remiseFidelite)).plus(money(sale._sum.remiseParrainage)), money(0));
    const siteNames = new Map(sites.map((site) => [site.id, sites.filter((other) => other.nom === site.nom).length > 1 ? `${site.nom} (${site.id.slice(0, 8)})` : site.nom]));
    const groupedSeries = new Map<string, Record<string, number>>();
    for (const bucket of reportBuckets(dates.gte, dates.lte, granularite)) {
      groupedSeries.set(bucket.toISOString(), Object.fromEntries([...siteNames.values()].map((name) => [name, 0])));
    }
    for (const point of timeSeries) {
      const values = groupedSeries.get(new Date(point.bucket).toISOString());
      if (values && siteNames.has(point.siteId)) values[siteNames.get(point.siteId)] = amount(money(point.amount));
    }
    const parSite = sites.map((site) => {
      const siteSales = sales.filter((sale) => sale.siteId === site.id);
      const ca = siteSales.reduce((sum, sale) => sum.plus(money(sale._sum.montantNet)), money(0));
      return {
        siteId: site.id, siteNom: siteNames.get(site.id), ca: amount(ca),
        nbVentes: siteSales.reduce((sum, sale) => sum + sale._count.id, 0),
        nbNouveauxClients: newClients.find((entry) => entry.siteInscriptionId === site.id)?._count.id ?? 0,
        alertesStock: Number(stocks.find((stock) => stock.siteId === site.id)?.alerts ?? 0),
        pourcentageCA: total.isZero() ? 0 : ca.div(total).times(100).toDecimalPlaces(1).toNumber(),
      };
    });
    const paymentMethods = new Map<string, { count: number; total: Prisma.Decimal }>();
    for (const sale of sales) {
      const current = paymentMethods.get(sale.modePaiement) ?? { count: 0, total: money(0) };
      current.count += sale._count.id;
      current.total = current.total.plus(money(sale._sum.montantNet));
      paymentMethods.set(sale.modePaiement, current);
    }
    return {
      seriesCA: [...groupedSeries].map(([bucket, values]) => ({ label: reportBucketLabel(new Date(bucket), granularite), values })),
      totalCA: amount(total), nbVentes, parSite,
      topProduits: topLines.map((line) => ({
        nom: productsById.get(line.produitId)?.nom ?? 'Produit supprimé',
        sku: productsById.get(line.produitId)?.sku ?? '',
        quantite: line._sum.quantite ?? 0, ca: amount(money(line._sum.sousTotal)),
      })),
      activity: {
        generatedAt: new Date().toISOString(),
        refunds: { count: refunds._count.id, amount: amount(money(refunds._sum.montantRembourse)) },
        pendingSales: { count: pending._count.id, amount: amount(money(pending._sum.montantNet)) },
        netAfterRefunds: amount(total.minus(money(refunds._sum.montantRembourse))),
        discounts: amount(discounts), averageBasket: nbVentes ? amount(total.div(nbVentes)) : 0,
        onboardingCDF: amount(steps.filter((step) => ['RECIT', 'FICHE'].includes(step.etape)).reduce((sum, step) => sum.plus(money(step._sum.montant)), money(0))),
        onboarding: steps.filter((step) => ['RECIT', 'FICHE', 'ACTIVATION'].includes(step.etape)).map((step) => ({
          etape: step.etape, count: step._count.id, amount: amount(money(step._sum.montant)),
          currency: step.etape === 'ACTIVATION' ? 'USD' : 'CDF', includedInSales: step.etape === 'ACTIVATION',
        })),
        payments: [...paymentMethods].map(([mode, entry]) => ({ mode, count: entry.count, amount: amount(entry.total) })),
        clients: {
          total: clientStatuses.reduce((sum, entry) => sum + entry._count.id, 0), activated,
          byStatus: Object.fromEntries(clientStatuses.map((entry) => [entry.statut, entry._count.id])),
        },
        stock: {
          references: stocks.reduce((sum, stock) => sum + Number(stock.references), 0),
          units: stocks.reduce((sum, stock) => sum + Number(stock.units), 0),
          alerts: stocks.reduce((sum, stock) => sum + Number(stock.alerts), 0),
          value: amount(stocks.reduce((sum, stock) => sum.plus(money(stock.value)), money(0))),
        },
      },
    };
  }

  // ─── Existing getVentes ────────────────────────────────────────────────────

  async getVentes(query: {
    siteId?: string;
    dateDebut: string;
    dateFin: string;
    granularite?: string;
  }, actor: StaffActor) {
    const { siteId, dateDebut, dateFin, granularite = 'day' } = query;

    const where: any = {
      ...staffSalesWhere(actor, siteId),
      createdAt: {
        gte: new Date(dateDebut),
        lte: new Date(dateFin),
      },
      statut: { not: 'ANNULEE' },
    };
    const [ventes, totaux] = await Promise.all([
      this.prisma.vente.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          montantNet: true,
          montantBrut: true,
          remiseFidelite: true,
          remiseParrainage: true,
          pointsAttribues: true,
          modePaiement: true,
          siteId: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.vente.aggregate({
        where,
        _sum: {
          montantNet: true,
          montantBrut: true,
          remiseFidelite: true,
          remiseParrainage: true,
          pointsAttribues: true,
        },
        _count: { id: true },
      }),
    ]);

    // Regrouper par granularité
    const grouped = this.groupByGranularity(ventes, granularite);

    return {
      summary: {
        totalVentes: totaux._count.id,
        montantBrut: totaux._sum.montantBrut ?? 0,
        montantNet: totaux._sum.montantNet ?? 0,
        remiseFidelite: totaux._sum.remiseFidelite ?? 0,
        remiseParrainage: totaux._sum.remiseParrainage ?? 0,
        pointsAttribues: totaux._sum.pointsAttribues ?? 0,
      },
      data: grouped,
    };
  }

  async getVentesDetail(query: {
    siteId?: string;
    dateDebut?: string;
    dateFin?: string;
    agentId?: string;
    modePaiement?: string;
    categorie?: string;
    page?: number;
    limit?: number;
    search?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    const { siteId, dateDebut, dateFin, agentId, modePaiement, categorie, page = 1, limit = 50, search, sortDir = 'desc' } = query;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 200 || !['asc', 'desc'].includes(sortDir)) {
      throw new BadRequestException('La pagination ou le tri du rapport est invalide.');
    }
    if (modePaiement && !['CASH', 'MPESA', 'AIRTEL_MONEY', 'VIREMENT'].includes(modePaiement)) {
      throw new BadRequestException('Le mode de paiement est invalide.');
    }

    const where: Prisma.VenteWhereInput = { statut: { in: PAID_STATUSES } };
    if (siteId) where.siteId = siteId;
    if (agentId) where.agentId = agentId;
    if (modePaiement) where.modePaiement = modePaiement as Prisma.VenteWhereInput['modePaiement'];
    if (dateDebut || dateFin) {
      where.createdAt = reportPeriod(dateDebut, dateFin);
    }
    if (categorie) {
      where.lignes = { some: { produit: { categorie } } };
    }
    if (search?.trim()) {
      where.OR = [
        { numeroVente: { contains: search.trim(), mode: 'insensitive' } },
        { client: { nom: { contains: search.trim(), mode: 'insensitive' } } },
        { client: { prenom: { contains: search.trim(), mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [ventes, total] = await Promise.all([
      this.prisma.vente.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: sortDir }, { id: sortDir }],
        include: {
          site: { select: { id: true, nom: true } },
          agent: { select: { id: true, nom: true } },
          client: { select: { id: true, prenom: true, nom: true } },
          lignes: {
            include: {
              produit: { select: { id: true, sku: true, nom: true, categorie: true } },
            },
          },
        },
      }),
      this.prisma.vente.count({ where }),
    ]);

    // Résumé agrégé sur tous les résultats (sans pagination)
    const totaux = await this.prisma.vente.aggregate({
      where,
      _sum: { montantNet: true, remiseFidelite: true, remiseParrainage: true },
      _count: { id: true },
    });
    const totalCA = amount(money(totaux._sum.montantNet));
    const nbVentes = totaux._count.id;
    const remises = amount(money(totaux._sum.remiseFidelite).plus(money(totaux._sum.remiseParrainage)));

    // Calcul trends (période précédente de même durée)
    let trendCA = 0;
    let trendVentes = 0;
    if (dateDebut && dateFin) {
      const { gte: from, lte: to } = reportPeriod(dateDebut, dateFin);
      const diff = to.getTime() - from.getTime() + 1;
      const prevFrom = new Date(from.getTime() - diff);
      const prevTo = new Date(from.getTime() - 1);
      const prevWhere: any = { ...where, createdAt: { gte: prevFrom, lte: prevTo } };
      const prevTotaux = await this.prisma.vente.aggregate({
        where: prevWhere,
        _sum: { montantNet: true },
        _count: { id: true },
      });
      const prevCA = Number(prevTotaux._sum.montantNet ?? 0);
      const prevNb = prevTotaux._count.id;
      trendCA = prevCA > 0 ? Math.round(((totalCA - prevCA) / prevCA) * 100) : 0;
      trendVentes = prevNb > 0 ? Math.round(((nbVentes - prevNb) / prevNb) * 100) : 0;
    }

    // Totaux par agent
    const agentAgg = await this.prisma.vente.groupBy({
      by: ['agentId'],
      where,
      _count: { id: true },
      _sum: { montantNet: true, remiseFidelite: true, remiseParrainage: true },
    });
    const agentIds = agentAgg.map((a) => a.agentId);
    const agents = await this.prisma.utilisateur.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, nom: true, site: { select: { nom: true } } },
    });
    const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));
    const totauxParAgent = agentAgg.map((a) => ({
      agentId: a.agentId,
      agentNom: agentMap[a.agentId]?.nom ?? a.agentId,
      siteNom: agentMap[a.agentId]?.site?.nom ?? '',
      nbVentes: a._count.id,
      caTotal: Number(a._sum.montantNet ?? 0),
      caMoyen: a._count.id > 0 ? amount(money(a._sum.montantNet).div(a._count.id)) : 0,
      remisesAccordees: amount(money(a._sum.remiseFidelite).plus(money(a._sum.remiseParrainage))),
    })).sort((a, b) => b.caTotal - a.caTotal);

    return {
      ventes,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      resume: {
        totalCA,
        nbVentes,
        remisesAccordees: remises,
        ticketMoyen: nbVentes > 0 ? amount(money(totalCA).div(nbVentes)) : 0,
        trends: { ca: trendCA, ventes: trendVentes },
      },
      totauxParAgent,
    };
  }

  async getStocksConsolide(query: { siteId?: string; categorie?: string; search?: string }) {
    const { siteId, categorie, search } = query;

    const where: any = {};
    if (siteId) where.siteId = siteId;
    if (categorie) where.produit = { categorie };
    if (search?.trim()) {
      where.produit = {
        ...where.produit,
        OR: [
          { nom: { contains: search.trim(), mode: 'insensitive' } },
          { sku: { contains: search.trim(), mode: 'insensitive' } },
        ],
      };
    }

    const stocks = await this.prisma.stockSite.findMany({
      where,
      include: {
        produit: {
          select: {
            id: true,
            sku: true,
            nom: true,
            categorie: true,
            prixVente: true,
            prixAchat: true,
            actif: true,
          },
        },
        site: { select: { id: true, nom: true, ville: true } },
      },
      orderBy: [{ produit: { categorie: 'asc' } }, { produit: { nom: 'asc' } }],
    });

    // Consolider par produit
    const byProduit: Record<string, any> = {};
    for (const s of stocks) {
      const pid = s.produitId;
      if (!byProduit[pid]) {
        byProduit[pid] = {
          produit: s.produit,
          totalQuantite: 0,
          sites: [],
          valeurStock: 0,
        };
      }
      byProduit[pid].totalQuantite += s.quantite;
      byProduit[pid].sites.push({
        site: s.site,
        quantite: s.quantite,
        seuilAlerte: s.seuilAlerte,
        alerte: s.quantite <= s.seuilAlerte,
      });
      byProduit[pid].valeurStock = amount(money(byProduit[pid].valeurStock).plus(money(s.produit.prixAchat).times(s.quantite)));
    }

    return {
      data: Object.values(byProduit),
      totalProduits: Object.keys(byProduit).length,
      totalSites: siteId ? 1 : await this.prisma.site.count({ where: { actif: true } }),
    };
  }

  private groupByGranularity(ventes: any[], granularite: string) {
    const grouped: Record<string, { periode: string; count: number; montantNet: number; montantBrut: number }> = {};

    for (const v of ventes) {
      const date = new Date(v.createdAt);
      let key: string;

      switch (granularite) {
        case 'hour':
          key = `${date.toISOString().slice(0, 13)}:00`;
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay() + 1);
          key = weekStart.toISOString().slice(0, 10);
          break;
        case 'month':
          key = date.toISOString().slice(0, 7);
          break;
        case 'year':
          key = String(date.getFullYear());
          break;
        default: // day
          key = date.toISOString().slice(0, 10);
      }

      if (!grouped[key]) {
        grouped[key] = { periode: key, count: 0, montantNet: 0, montantBrut: 0 };
      }
      grouped[key].count++;
      grouped[key].montantNet += Number(v.montantNet);
      grouped[key].montantBrut += Number(v.montantBrut);
    }

    return Object.values(grouped).sort((a, b) => a.periode.localeCompare(b.periode));
  }

}
