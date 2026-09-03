import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, StatutClient } from '@prisma/client';
import { format, subDays, subMonths, startOfMonth, startOfYear, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';

const SITE_COLORS: Record<string, string> = {};
const FALLBACK_COLORS = ['#2E86C1', '#1A6B3A', '#E65100', '#8E24AA', '#00838F'];

function getPeriodRange(period: string): { dateDebut: Date; dateFin: Date } {
  const now = new Date();
  const dateFin = now;
  let dateDebut: Date;

  switch (period) {
    case 'today':
      dateDebut = startOfDay(now);
      break;
    case 'week':
      dateDebut = subDays(now, 7);
      break;
    case 'year':
      dateDebut = startOfYear(now);
      break;
    case 'month':
    default:
      dateDebut = startOfMonth(now);
  }

  return { dateDebut, dateFin };
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private async resolveSiteIds(role: Role, userSiteId: string | undefined, querySiteId?: string): Promise<string[] | null> {
    if (role === Role.AGENT || role === Role.GERANT || role === Role.FORMATEUR) {
      return userSiteId ? [userSiteId] : null;
    }
    if (querySiteId) return [querySiteId];
    // null = all sites
    return null;
  }

  async getStats(
    siteId: string | undefined,
    period: string = 'today',
    user: { id: string; role: Role; siteId?: string },
  ) {
    const siteIds = await this.resolveSiteIds(user.role, user.siteId, siteId);
    const { dateDebut, dateFin } = getPeriodRange(period);

    // Previous period for trends
    const periodLength = dateFin.getTime() - dateDebut.getTime();
    const prevDateDebut = new Date(dateDebut.getTime() - periodLength);
    const prevDateFin = dateDebut;

    const siteFilter = siteIds ? { siteId: { in: siteIds } } : {};
    const siteInscriptionFilter = siteIds ? { siteInscriptionId: { in: siteIds } } : {};

    const [clientsActifs, clientsActifsPrev, ventesData, ventesPrevData, parrainages, parainagesPrev, stockSites] =
      await Promise.all([
        this.prisma.client.count({ where: { ...siteInscriptionFilter, statut: StatutClient.ACTIF } }),
        this.prisma.client.count({
          where: {
            ...siteInscriptionFilter,
            statut: StatutClient.ACTIF,
            createdAt: { lte: prevDateFin },
          },
        }),
        this.prisma.vente.aggregate({
          where: { ...siteFilter, createdAt: { gte: dateDebut, lte: dateFin }, statut: 'VALIDE' },
          _sum: { montantNet: true },
        }),
        this.prisma.vente.aggregate({
          where: { ...siteFilter, createdAt: { gte: prevDateDebut, lte: prevDateFin }, statut: 'VALIDE' },
          _sum: { montantNet: true },
        }),
        this.prisma.membre.count({
          where: {
            dateInscription: { gte: dateDebut, lte: dateFin },
            ...(siteIds ? { client: { siteInscriptionId: { in: siteIds } } } : {}),
          },
        }),
        this.prisma.membre.count({
          where: {
            dateInscription: { gte: prevDateDebut, lte: prevDateFin },
            ...(siteIds ? { client: { siteInscriptionId: { in: siteIds } } } : {}),
          },
        }),
        this.prisma.stockSite.findMany({
          where: siteIds ? { siteId: { in: siteIds } } : {},
          select: { quantite: true, seuilAlerte: true },
        }),
      ]);

    const alertesStock = stockSites.filter((s) => s.quantite <= s.seuilAlerte && s.quantite > 0).length;
    const rupturesStock = stockSites.filter((s) => s.quantite <= 0).length;

    const ventesJour = Number(ventesData._sum.montantNet ?? 0);
    const ventesPrev = Number(ventesPrevData._sum.montantNet ?? 0);

    const pct = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    return {
      clientsActifs,
      ventesJour,
      alertesStock: alertesStock + rupturesStock,
      rupturesStock,
      nouveauxFilleuls: parrainages,
      trends: {
        clientsActifs: pct(clientsActifs, clientsActifsPrev),
        ventesJour: pct(ventesJour, ventesPrev),
        nouveauxFilleuls: pct(parrainages, parainagesPrev),
      },
    };
  }

  async getSalesChart(siteId: string | undefined, days: number = 7) {
    const sites = await this.prisma.site.findMany({
      where: siteId ? { id: siteId, actif: true } : { actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    });

    const dateDebut = subDays(new Date(), days);

    const labels: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      labels.push(format(d, 'EEE d', { locale: fr }));
    }

    const colorMap: Record<string, string> = {
      Goma: '#2E86C1',
      Bukavu: '#1A6B3A',
      Kinshasa: '#E65100',
    };

    const datasets = await Promise.all(
      sites.map(async (site, idx) => {
        const ventes = await this.prisma.vente.findMany({
          where: { siteId: site.id, createdAt: { gte: dateDebut }, statut: 'VALIDE' },
          select: { createdAt: true, montantNet: true },
        });

        const byDay: Record<string, number> = {};
        ventes.forEach((v) => {
          const key = v.createdAt.toISOString().split('T')[0];
          byDay[key] = (byDay[key] ?? 0) + Number(v.montantNet);
        });

        const data: number[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = subDays(new Date(), i);
          const key = d.toISOString().split('T')[0];
          data.push(byDay[key] ?? 0);
        }

        return {
          site: site.nom,
          siteId: site.id,
          data,
          color: colorMap[site.nom] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
        };
      }),
    );

    return { labels, datasets };
  }

  async getRecentTransactions(siteId: string | undefined, limit: number = 5) {
    const ventes = await this.prisma.vente.findMany({
      where: siteId ? { siteId } : {},
      take: Math.min(limit, 20),
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, prenom: true, nom: true } },
        site: { select: { id: true, nom: true } },
        lignes: {
          take: 2,
          include: { produit: { select: { nom: true } } },
        },
      },
    });

    const transactions = ventes.map((v) => {
      const firstProd = v.lignes[0]?.produit.nom ?? '—';
      const extra = v.lignes.length > 1 ? ` et ${v.lignes.length - 1} autre(s)` : '';
      const clientNom = v.client
        ? `${v.client.prenom} ${v.client.nom}`.toUpperCase()
        : 'Client anonyme';

      return {
        id: v.id,
        numeroVente: v.numeroVente,
        clientNom,
        produit: firstProd + extra,
        montant: Number(v.montantNet),
        site: v.site?.nom ?? '',
        statut: v.statut,
        createdAt: v.createdAt.toISOString(),
      };
    });

    return { transactions };
  }

  async getStockAlerts(siteId: string | undefined, limit: number = 3) {
    const stockSites = await this.prisma.stockSite.findMany({
      where: siteId ? { siteId } : {},
      include: {
        produit: { select: { id: true, nom: true, sku: true } },
        site: { select: { id: true, nom: true } },
      },
      orderBy: { quantite: 'asc' },
    });

    const alerts = stockSites
      .filter((s) => s.quantite <= s.seuilAlerte)
      .slice(0, limit)
      .map((s) => ({
        produitNom: s.produit.nom,
        sku: s.produit.sku,
        siteNom: s.site.nom,
        stockActuel: s.quantite,
        seuilAlerte: s.seuilAlerte,
        type: s.quantite <= 0 ? ('RUPTURE' as const) : ('ALERTE' as const),
      }));

    return { alerts };
  }

  async getRegionalDashboard(
    period: string = 'month',
    dateFrom?: string,
    dateTo?: string,
    user?: { id: string; role: Role; siteId?: string },
  ) {
    if (user && user.role !== Role.DIRECTEUR_REGIONAL && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Accès réservé au Directeur Régional et Super Admin');
    }

    let dateDebut: Date;
    let dateFin = new Date();

    if (dateFrom && dateTo) {
      dateDebut = new Date(dateFrom);
      dateFin = new Date(dateTo);
    } else {
      dateDebut = getPeriodRange(period).dateDebut;
    }

    const [comparison, revenueChart, topProduits, topParrains] = await Promise.all([
      this.getSitesComparison(dateDebut, dateFin, period),
      this.getRevenueChartData(dateDebut, dateFin, period),
      this.getTopProducts(dateDebut, dateFin, 5),
      Promise.resolve([]),
    ]);

    return { comparison, revenueChart, topProduits, topParrains };
  }

  private async getSitesComparison(dateDebut: Date, dateFin: Date, period: string) {
    const periodLength = dateFin.getTime() - dateDebut.getTime();
    const prevDebut = new Date(dateDebut.getTime() - periodLength);
    const prevFin = dateDebut;

    const sites = await this.prisma.site.findMany({
      where: { actif: true },
      select: { id: true, nom: true, ville: true },
    });

    const siteData = await Promise.all(
      sites.map(async (site) => {
        const [clientsActifs, nbVentes, ventesCa, ventesPrevCa, stockSites] = await Promise.all([
          this.prisma.client.count({ where: { siteInscriptionId: site.id, statut: StatutClient.ACTIF } }),
          this.prisma.vente.count({ where: { siteId: site.id, createdAt: { gte: dateDebut, lte: dateFin }, statut: 'VALIDE' } }),
          this.prisma.vente.aggregate({
            where: { siteId: site.id, createdAt: { gte: dateDebut, lte: dateFin }, statut: 'VALIDE' },
            _sum: { montantNet: true },
          }),
          this.prisma.vente.aggregate({
            where: { siteId: site.id, createdAt: { gte: prevDebut, lte: prevFin }, statut: 'VALIDE' },
            _sum: { montantNet: true },
          }),
          this.prisma.stockSite.findMany({
            where: { siteId: site.id },
            select: { quantite: true, seuilAlerte: true },
          }),
        ]);

        const ca = Number(ventesCa._sum.montantNet ?? 0);
        const prevCa = Number(ventesPrevCa._sum.montantNet ?? 0);
        const caVariation = prevCa === 0 ? (ca > 0 ? 100 : 0) : Math.round(((ca - prevCa) / prevCa) * 100);
        const alertesStock = stockSites.filter((s) => s.quantite <= s.seuilAlerte).length;

        return {
          siteId: site.id,
          siteNom: site.nom,
          siteVille: site.ville,
          ca,
          nbVentes,
          nbClientsActifs: clientsActifs,
          alertesStock,
          caVariation,
        };
      }),
    );

    const totaux = {
      ca: siteData.reduce((a, s) => a + s.ca, 0),
      nbVentes: siteData.reduce((a, s) => a + s.nbVentes, 0),
      nbClientsActifs: siteData.reduce((a, s) => a + s.nbClientsActifs, 0),
      alertesStock: siteData.reduce((a, s) => a + s.alertesStock, 0),
    };

    return { sites: siteData, totaux };
  }

  private async getRevenueChartData(dateDebut: Date, dateFin: Date, period: string) {
    const sites = await this.prisma.site.findMany({
      where: { actif: true },
      select: { id: true, nom: true },
    });

    const colorMap: Record<string, string> = {
      Goma: '#2E86C1',
      Bukavu: '#1A6B3A',
      Kinshasa: '#E65100',
    };

    // Build labels
    const labels: string[] = [];
    const dayDiff = Math.ceil((dateFin.getTime() - dateDebut.getTime()) / (1000 * 60 * 60 * 24));

    if (period === 'month' || dayDiff <= 31) {
      for (let i = 0; i < dayDiff; i++) {
        const d = new Date(dateDebut);
        d.setDate(d.getDate() + i);
        labels.push(format(d, 'd'));
      }
    } else if (period === 'quarter') {
      // weeks
      const weeks = Math.ceil(dayDiff / 7);
      for (let i = 0; i < weeks; i++) {
        const d = new Date(dateDebut);
        d.setDate(d.getDate() + i * 7);
        labels.push(`S${i + 1} ${format(d, 'MMM', { locale: fr })}`);
      }
    } else {
      // months
      for (let m = 0; m < 12; m++) {
        labels.push(format(new Date(dateDebut.getFullYear(), m), 'MMM', { locale: fr }));
      }
    }

    const datasets = await Promise.all(
      sites.map(async (site, idx) => {
        const ventes = await this.prisma.vente.findMany({
          where: { siteId: site.id, createdAt: { gte: dateDebut, lte: dateFin }, statut: 'VALIDE' },
          select: { createdAt: true, montantNet: true },
        });

        const data = labels.map((_, i) => {
          let start: Date;
          let end: Date;
          if (period === 'year') {
            start = new Date(dateDebut.getFullYear(), i, 1);
            end = new Date(dateDebut.getFullYear(), i + 1, 0, 23, 59, 59);
          } else if (period === 'quarter') {
            start = new Date(dateDebut);
            start.setDate(start.getDate() + i * 7);
            end = new Date(start);
            end.setDate(end.getDate() + 6);
          } else {
            start = new Date(dateDebut);
            start.setDate(start.getDate() + i);
            end = new Date(start);
            end.setHours(23, 59, 59);
          }

          return ventes
            .filter((v) => v.createdAt >= start && v.createdAt <= end)
            .reduce((sum, v) => sum + Number(v.montantNet), 0);
        });

        return {
          site: site.nom,
          siteId: site.id,
          data,
          color: colorMap[site.nom] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
        };
      }),
    );

    return { labels, datasets };
  }

  private async getTopProducts(dateDebut: Date, dateFin: Date, limit: number) {
    const lignes = await this.prisma.ligneVente.findMany({
      where: {
        vente: { createdAt: { gte: dateDebut, lte: dateFin }, statut: 'VALIDE' },
      },
      include: {
        produit: { select: { id: true, nom: true, sku: true, categorie: true } },
        vente: { select: { siteId: true } },
      },
    });

    const byProduct: Record<string, {
      produitId: string;
      produitNom: string;
      sku: string;
      categorie: string;
      quantiteVendue: number;
      caGenere: number;
      siteCount: Record<string, number>;
    }> = {};

    lignes.forEach((l) => {
      const key = l.produitId;
      if (!byProduct[key]) {
        byProduct[key] = {
          produitId: l.produitId,
          produitNom: l.produit.nom,
          sku: l.produit.sku,
          categorie: l.produit.categorie,
          quantiteVendue: 0,
          caGenere: 0,
          siteCount: {},
        };
      }
      byProduct[key].quantiteVendue += l.quantite;
      byProduct[key].caGenere += Number(l.sousTotal);
      const sid = l.vente.siteId;
      byProduct[key].siteCount[sid] = (byProduct[key].siteCount[sid] ?? 0) + l.quantite;
    });

    const sites = await this.prisma.site.findMany({ select: { id: true, nom: true } });
    const siteNameMap: Record<string, string> = Object.fromEntries(sites.map((s) => [s.id, s.nom]));

    return Object.values(byProduct)
      .sort((a, b) => b.quantiteVendue - a.quantiteVendue)
      .slice(0, limit)
      .map((p, i) => {
        const leaderId = Object.entries(p.siteCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '';
        return {
          rang: i + 1,
          produitId: p.produitId,
          produitNom: p.produitNom,
          sku: p.sku,
          categorie: p.categorie,
          quantiteVendue: p.quantiteVendue,
          caGenere: p.caGenere,
          siteLeader: siteNameMap[leaderId] ?? '',
        };
      });
  }


}
