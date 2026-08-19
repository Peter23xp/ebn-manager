import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MlmService {
  constructor(private readonly prisma: PrismaService) {}
  async stats(siteId?: string) {
    const membre = (this.prisma as any).membre;
    const where = siteId ? { client: { siteInscriptionId: siteId } } : {};
    const [membresActifs, membresEnAttente] = await Promise.all([membre.count({ where: { ...where, statut: 'ACTIF' } }), membre.count({ where: { ...where, statut: 'EN_ATTENTE' } })]);
    return { membresActifs, membresEnAttente, commissionsVersees: 0, promotionsPeriode: 0, bonusDistribues: 0, salairesMensuels: 0, bonusRetraiteVerses: 0, trends: { membres: 0, commissions: 0 } };
  }
  async memberProgress(id: string) { const member = await (this.prisma as any).membre.findUnique({ where: { id }, include: { client: true, level: true, matrices: { include: { positions: true } }, portefeuille: true, promotions: true, bonusAttribues: true } }); if (!member) throw new NotFoundException('Membre introuvable'); return member; }
  async myWallet(clientId: string) { const member = await (this.prisma as any).membre.findUnique({ where: { clientId }, include: { portefeuille: { include: { transactions: { orderBy: { createdAt: 'desc' } } } }, level: true } }); if (!member?.portefeuille) throw new NotFoundException('Portefeuille introuvable'); return { ...member.portefeuille, membre: member }; }
  async levels() { return (this.prisma as any).mlmLevel.findMany({ orderBy: { ordre: 'asc' } }); }
}
