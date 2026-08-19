import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutExport } from '@prisma/client';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

@Injectable()
export class RapportsService {
  constructor(private prisma: PrismaService) {}

  // ─── SCR-030 : Dashboard Rapports ─────────────────────────────────────────

  async getVentesDashboard(query: {
    siteId?: string;
    dateDebut: string;
    dateFin: string;
    granularite?: 'day' | 'week' | 'month';
    userSiteId?: string; // force scope for GERANT
  }) {
    const {
      dateDebut,
      dateFin,
      granularite = 'day',
      userSiteId,
    } = query;

    // GERANT → force to their own site
    const effectiveSiteId = userSiteId ?? query.siteId;

    const dateFrom = new Date(dateDebut);
    const dateTo   = new Date(dateFin);

    const whereBase: any = {
      createdAt: { gte: dateFrom, lte: dateTo },
      statut: { not: 'ANNULEE' },
    };
    if (effectiveSiteId) whereBase.siteId = effectiveSiteId;

    // 1. Fetch all relevant ventes with siteId
    const ventes = await this.prisma.vente.findMany({
      where: whereBase,
      select: {
        id: true,
        createdAt: true,
        montantNet: true,
        siteId: true,
        site: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 2. Fetch sites for context (to determine total CA %)
    const sites = effectiveSiteId
      ? await this.prisma.site.findMany({ where: { id: effectiveSiteId } })
      : await this.prisma.site.findMany({ where: { actif: true } });

    const siteMap: Record<string, string> = {};
    sites.forEach((s) => (siteMap[s.id] = s.nom));

    // 3. Build time-series labels + per-site values
    const allLabels = this.buildLabels(dateFrom, dateTo, granularite);
    // { label → { siteNom → ca } }
    const seriesMap: Record<string, Record<string, number>> = {};
    allLabels.forEach((l) => { seriesMap[l] = {}; });

    const siteCATotal: Record<string, number> = {};
    const siteVentesCount: Record<string, number> = {};

    for (const v of ventes) {
      const label = this.getLabelForDate(new Date(v.createdAt), granularite);
      const siteNom = v.site?.nom ?? 'Inconnu';
      const ca = Number(v.montantNet);
      if (seriesMap[label] !== undefined) {
        seriesMap[label][siteNom] = (seriesMap[label][siteNom] ?? 0) + ca;
      }
      siteCATotal[siteNom] = (siteCATotal[siteNom] ?? 0) + ca;
      siteVentesCount[siteNom] = (siteVentesCount[siteNom] ?? 0) + 1;
    }

    const seriesCA = allLabels.map((label) => ({
      label,
      values: seriesMap[label] ?? {},
    }));

    const totalCA = Object.values(siteCATotal).reduce((s, v) => s + v, 0);

    // 4. Per-site stats (nouveaux clients + alertes stock)
    const parSite = await Promise.all(
      sites.map(async (site) => {
        const ca = siteCATotal[site.nom] ?? 0;
        const nbVentes = siteVentesCount[site.nom] ?? 0;

        const [nbNouveauxClients, alertesStockRows] = await Promise.all([
          this.prisma.client.count({
            where: {
              siteInscriptionId: site.id,
              createdAt: { gte: dateFrom, lte: dateTo },
            },
          }),
          // Cross-column comparison (quantite <= seuilAlerte) requires raw SQL
          this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*)::int as count
            FROM stock_sites
            WHERE "siteId" = ${site.id}
              AND quantite <= "seuilAlerte"
          `,
        ]);

        return {
          siteId: site.id,
          siteNom: site.nom,
          ca,
          nbVentes,
          nbNouveauxClients,
          alertesStock: Number(alertesStockRows[0]?.count ?? 0),
          pourcentageCA: totalCA > 0 ? Math.round((ca / totalCA) * 1000) / 10 : 0,
        };
      }),
    );

    // 5. Top 5 produits
    const ligneAgg = await this.prisma.ligneVente.groupBy({
      by: ['produitId'],
      where: {
        vente: {
          createdAt: { gte: dateFrom, lte: dateTo },
          statut: { not: 'ANNULEE' },
          ...(effectiveSiteId ? { siteId: effectiveSiteId } : {}),
        },
      },
      _sum: { quantite: true, sousTotal: true },
      orderBy: { _sum: { quantite: 'desc' } },
      take: 5,
    });

    const produitIds = ligneAgg.map((l) => l.produitId);
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: produitIds } },
      select: { id: true, nom: true, sku: true },
    });
    const produitMap = Object.fromEntries(produits.map((p) => [p.id, p]));

    const topProduits = ligneAgg.map((l) => ({
      nom: produitMap[l.produitId]?.nom ?? l.produitId,
      sku: produitMap[l.produitId]?.sku ?? '',
      quantite: l._sum.quantite ?? 0,
      ca: Number(l._sum.sousTotal ?? 0),
    }));

    return { seriesCA, totalCA, nbVentes: ventes.length, topProduits, parSite };
  }

  // ─── Existing getVentes ────────────────────────────────────────────────────

  async getVentes(query: {
    siteId?: string;
    dateDebut: string;
    dateFin: string;
    granularite?: string;
  }) {
    const { siteId, dateDebut, dateFin, granularite = 'day' } = query;

    const where: any = {
      createdAt: {
        gte: new Date(dateDebut),
        lte: new Date(dateFin),
      },
      statut: { not: 'ANNULEE' },
    };
    if (siteId) where.siteId = siteId;

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
  }) {
    const { siteId, dateDebut, dateFin, agentId, modePaiement, categorie, page = 1, limit = 50 } = query;

    const where: any = { statut: { not: 'ANNULEE' } };
    if (siteId) where.siteId = siteId;
    if (agentId) where.agentId = agentId;
    if (modePaiement) where.modePaiement = modePaiement;
    if (dateDebut || dateFin) {
      where.createdAt = {};
      if (dateDebut) where.createdAt.gte = new Date(dateDebut);
      if (dateFin) where.createdAt.lte = new Date(dateFin);
    }
    if (categorie) {
      where.lignes = { some: { produit: { categorie } } };
    }

    const skip = (page - 1) * limit;

    const [ventes, total] = await Promise.all([
      this.prisma.vente.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
    const totalCA = Number(totaux._sum.montantNet ?? 0);
    const nbVentes = totaux._count.id;
    const remises = Number(totaux._sum.remiseFidelite ?? 0) + Number(totaux._sum.remiseParrainage ?? 0);

    // Calcul trends (période précédente de même durée)
    let trendCA = 0;
    let trendVentes = 0;
    if (dateDebut && dateFin) {
      const from = new Date(dateDebut);
      const to = new Date(dateFin);
      const diff = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - diff);
      const prevTo = new Date(from.getTime());
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
      caMoyen: a._count.id > 0 ? Math.round(Number(a._sum.montantNet ?? 0) / a._count.id) : 0,
      remisesAccordees: Number(a._sum.remiseFidelite ?? 0) + Number(a._sum.remiseParrainage ?? 0),
    })).sort((a, b) => b.caTotal - a.caTotal);

    return {
      ventes,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      resume: {
        totalCA,
        nbVentes,
        remisesAccordees: remises,
        ticketMoyen: nbVentes > 0 ? Math.round(totalCA / nbVentes) : 0,
        trends: { ca: trendCA, ventes: trendVentes },
      },
      totauxParAgent,
    };
  }

  async getStocksConsolide(query: { siteId?: string; categorie?: string }) {
    const { siteId, categorie } = query;

    const where: any = {};
    if (siteId) where.siteId = siteId;
    if (categorie) where.produit = { categorie };

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
      byProduit[pid].valeurStock +=
        s.quantite * Number(s.produit.prixAchat);
    }

    return {
      data: Object.values(byProduit),
      totalProduits: Object.keys(byProduit).length,
      totalSites: siteId ? 1 : await this.prisma.site.count({ where: { actif: true } }),
    };
  }

  // LEGACY PARRAINAGE REMOVED

  // LEGACY PARRAINAGE REPORT REMOVED
  // ── SCR-034 : Estimation export ────────────────────────────────────────────

  async getExportEstimate(query: { type: string; dateDebut?: string; dateFin?: string; siteId?: string }) {
    const { type, dateDebut, dateFin, siteId } = query;
    const where: any = {};
    if (dateDebut) where.createdAt = { ...(where.createdAt ?? {}), gte: new Date(dateDebut) };
    if (dateFin)   where.createdAt = { ...(where.createdAt ?? {}), lte: new Date(dateFin) };
    if (siteId) where.siteId = siteId;

    let estimatedRows = 0;
    switch (type) {
      case 'VENTES':
      case 'VENTES_DETAIL':
        estimatedRows = await this.prisma.vente.count({ where });
        break;
      case 'STOCKS':
        estimatedRows = await this.prisma.stockSite.count({ where: siteId ? { siteId } : undefined });
        break;

      case 'CLIENTS':
        estimatedRows = await this.prisma.client.count({ where: siteId ? { siteInscriptionId: siteId } : {} });
        break;
      default:
        estimatedRows = 100;
    }
    return { estimatedRows };
  }

  async createExport(body: {
    type: string;
    format: string;
    filtres?: Record<string, any>;
    userId?: string;
  }) {
    const job = await this.prisma.exportJob.create({
      data: {
        type: body.type,
        format: body.format,
        filtres: body.filtres ?? {},
        statut: StatutExport.PENDING,
      },
    });

    // Traitement asynchrone non-bloquant
    this.processExportJob(job.id).catch((err) => {
      console.error(`Export job ${job.id} failed:`, err);
    });

    return { jobId: job.id, statut: job.statut };
  }

  async getExportStatus(jobId: string) {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Job introuvable' });
    }

    return {
      jobId: job.id,
      type: job.type,
      format: job.format,
      statut: job.statut,
      downloadUrl: job.downloadUrl,
      errorMsg: job.errorMsg,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private async processExportJob(jobId: string) {
    // Simulation d'un export asynchrone
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
      if (!job) return;

      // Marquer comme prêt avec URL simulée
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          statut: StatutExport.READY,
          downloadUrl: `/exports/${jobId}.${job.format.toLowerCase()}`,
        },
      });
    } catch (err) {
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          statut: StatutExport.ERROR,
          errorMsg: err.message || 'Erreur lors de la génération',
        },
      });
    }
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

  // ─── Time-series helpers for getVentesDashboard ───────────────────────────

  /**
   * Returns the display label for a given date at a given granularity.
   * day   → "Lun 20 jan"
   * week  → "S3 jan"
   * month → "Jan 2025"
   */
  private getLabelForDate(date: Date, granularite: 'day' | 'week' | 'month'): string {
    switch (granularite) {
      case 'day':
        return format(date, 'EEE d MMM', { locale: fr });
      case 'week': {
        const ws = startOfWeek(date, { weekStartsOn: 1 });
        const weekNum = Math.ceil((ws.getDate() + new Date(ws.getFullYear(), ws.getMonth(), 1).getDay()) / 7);
        return `S${weekNum} ${format(ws, 'MMM', { locale: fr })}`;
      }
      case 'month':
        return format(startOfMonth(date), 'MMM yyyy', { locale: fr });
      default:
        return date.toISOString().slice(0, 10);
    }
  }

  /**
   * Generates an exhaustive ordered list of labels covering [from, to]
   * for the given granularity. Used to ensure zero-gaps in the series.
   */
  private buildLabels(
    from: Date,
    to: Date,
    granularite: 'day' | 'week' | 'month',
  ): string[] {
    const labels: string[] = [];
    const seen = new Set<string>();
    const cursor = new Date(from);

    while (cursor <= to) {
      const label = this.getLabelForDate(cursor, granularite);
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
      // Advance cursor
      switch (granularite) {
        case 'day':
          cursor.setDate(cursor.getDate() + 1);
          break;
        case 'week':
          cursor.setDate(cursor.getDate() + 7);
          break;
        case 'month':
          cursor.setMonth(cursor.getMonth() + 1);
          break;
      }
    }
    return labels;
  }
}
