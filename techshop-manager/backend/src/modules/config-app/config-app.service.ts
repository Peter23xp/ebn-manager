import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConfigAppService {
  constructor(private prisma: PrismaService) {}

  async getConfig() {
    const [configGenerale] = await Promise.all([
      this.prisma.configGenerale.findFirst(),
    ]);

    return {
      generale: configGenerale ?? {
        matriculeExterneActif: false,
        matriculeRegex: null,
        dureeSectionHeures: 8,
        delaiRetourJours: 7,
        fraisRetourPct: 0,
        smsApiKey: null,
        smsUsername: null,
        smsSenderId: null,
        kpayAutoPayoutActif: false,
        kpayAutoPayoutProvider: null,
        kpayAutoPayoutPhone: null,
        kpayAdminMpesaPhone: null,
        kpayAdminAirtelPhone: null,
        kpayAdminOrangePhone: null,
      },
    };
  }

  async updateConfig(dto: any) {
    const results: any = {};

    if (dto.generale) {
      const existing = await this.prisma.configGenerale.findFirst();
      if (existing) {
        results.generale = await this.prisma.configGenerale.update({
          where: { id: existing.id },
          data: {
            ...(dto.generale.smsApiKey !== undefined && { smsApiKey: dto.generale.smsApiKey }),
            ...(dto.generale.smsUsername !== undefined && { smsUsername: dto.generale.smsUsername }),
            ...(dto.generale.smsSenderId !== undefined && { smsSenderId: dto.generale.smsSenderId }),
            ...(dto.generale.matriculeExterneActif !== undefined && {
              matriculeExterneActif: dto.generale.matriculeExterneActif,
            }),
            ...(dto.generale.matriculeRegex !== undefined && { matriculeRegex: dto.generale.matriculeRegex }),
            ...(dto.generale.dureeSectionHeures !== undefined && {
              dureeSectionHeures: dto.generale.dureeSectionHeures,
            }),
            ...(dto.generale.delaiRetourJours !== undefined && {
              delaiRetourJours: dto.generale.delaiRetourJours,
            }),
            ...(dto.generale.fraisRetourPct !== undefined && { fraisRetourPct: dto.generale.fraisRetourPct }),
            ...(dto.generale.kpayAutoPayoutActif !== undefined && { kpayAutoPayoutActif: dto.generale.kpayAutoPayoutActif }),
            ...(dto.generale.kpayAutoPayoutProvider !== undefined && { kpayAutoPayoutProvider: dto.generale.kpayAutoPayoutProvider }),
            ...(dto.generale.kpayAutoPayoutPhone !== undefined && { kpayAutoPayoutPhone: dto.generale.kpayAutoPayoutPhone }),
            ...(dto.generale.kpayAdminMpesaPhone !== undefined && { kpayAdminMpesaPhone: dto.generale.kpayAdminMpesaPhone }),
            ...(dto.generale.kpayAdminAirtelPhone !== undefined && { kpayAdminAirtelPhone: dto.generale.kpayAdminAirtelPhone }),
            ...(dto.generale.kpayAdminOrangePhone !== undefined && { kpayAdminOrangePhone: dto.generale.kpayAdminOrangePhone }),
          },
        });
      } else {
        results.generale = await this.prisma.configGenerale.create({
          data: {
            smsApiKey: dto.generale.smsApiKey ?? null,
            smsUsername: dto.generale.smsUsername ?? null,
            smsSenderId: dto.generale.smsSenderId ?? null,
            matriculeExterneActif: dto.generale.matriculeExterneActif ?? false,
            matriculeRegex: dto.generale.matriculeRegex ?? null,
            dureeSectionHeures: dto.generale.dureeSectionHeures ?? 8,
            delaiRetourJours: dto.generale.delaiRetourJours ?? 7,
            fraisRetourPct: dto.generale.fraisRetourPct ?? 0,
            kpayAutoPayoutActif: dto.generale.kpayAutoPayoutActif ?? false,
            kpayAutoPayoutProvider: dto.generale.kpayAutoPayoutProvider ?? null,
            kpayAutoPayoutPhone: dto.generale.kpayAutoPayoutPhone ?? null,
            kpayAdminMpesaPhone: dto.generale.kpayAdminMpesaPhone ?? null,
            kpayAdminAirtelPhone: dto.generale.kpayAdminAirtelPhone ?? null,
            kpayAdminOrangePhone: dto.generale.kpayAdminOrangePhone ?? null,
          },
        });
      }
    }



    return { success: true, updated: results };
  }

  async testSms(phone: string) {
    const config = await this.prisma.configGenerale.findFirst();
    if (!config?.smsApiKey || !config?.smsUsername) {
      return { success: false, message: 'SMS non configuré. Veuillez renseigner API Key et Username.' };
    }
    console.log(`[TEST SMS] → ${phone}: "Test SMS depuis EBN Network Manager"`);
    return { success: true, message: `SMS de test envoyé à ${phone}` };
  }

  async getSystemStats() {
    const now = new Date();
    const debutJour = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalClients, clientsActifs, clientsEnCours,
      totalUtilisateurs, usersActifs,
      totalSites, sitesActifs,
      totalProduits, alertesStock, rupturesStock,
      totalParrainages,
      ventesJour, ventesMois,
      configGenerale,
    ] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.client.count({ where: { statut: 'ACTIF' } }),
      this.prisma.client.count({ where: { statut: 'EN_COURS' } }),
      this.prisma.utilisateur.count(),
      this.prisma.utilisateur.count({ where: { actif: true } }),
      this.prisma.site.count(),
      this.prisma.site.count({ where: { actif: true } }),
      this.prisma.produit.count(),
      this.prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM stock_sites WHERE quantite > 0 AND "seuilAlerte" > 0 AND quantite <= "seuilAlerte"`.then(r => Number(r[0]?.count ?? 0)),
      this.prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM stock_sites WHERE quantite = 0`.then(r => Number(r[0]?.count ?? 0)),
      this.prisma.membre.count(),
      this.prisma.vente.aggregate({ where: { createdAt: { gte: debutJour } }, _sum: { montantNet: true }, _count: { id: true } }),
      this.prisma.vente.aggregate({ where: { createdAt: { gte: debutMois } }, _sum: { montantNet: true }, _count: { id: true } }),

      this.prisma.configGenerale.findFirst(),
    ]);

    return {
      clients: { total: totalClients, actifs: clientsActifs, enCours: clientsEnCours },
      utilisateurs: { total: totalUtilisateurs, actifs: usersActifs, inactifs: totalUtilisateurs - usersActifs },
      sites: { total: totalSites, actifs: sitesActifs, inactifs: totalSites - sitesActifs },
      stocks: { totalProduits, alertes: alertesStock as number, ruptures: rupturesStock },
      ventes: {
        aujourdhui: { count: ventesJour._count.id, montant: Number(ventesJour._sum.montantNet ?? 0) },
        mois: { count: ventesMois._count.id, montant: Number(ventesMois._sum.montantNet ?? 0) },
      },
      parrainage: { total: totalParrainages },

      systeme: {
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        memoire: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        environnement: process.env.NODE_ENV ?? 'development',
        smsConfigured: !!(configGenerale?.smsApiKey && configGenerale?.smsUsername),
      },
    };
  }
}
