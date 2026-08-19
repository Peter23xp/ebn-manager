import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, TransactionType } from '@prisma/client';

@Injectable()
export class MlmWalletService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Get wallet ──────────────────────────────────────────────────────────────

  async getWallet(memberId: string) {
    const wallet = await this.prisma.portefeuille.findUnique({
      where: { membreId: memberId },
      include: {
        membre: {
          include: {
            client: { select: { id: true, prenom: true, nom: true } },
            level: { select: { id: true, ordre: true, nom: true, couleur: true } },
          },
        },
      },
    });
    if (!wallet) throw new NotFoundException(`Portefeuille introuvable pour membre ${memberId}`);

    return {
      id: wallet.id,
      membreId: wallet.membreId,
      soldeDisponible: Number(wallet.soldeDisponible),
      totalGagne: Number(wallet.totalGagne),
      membre: wallet.membre,
      updatedAt: wallet.updatedAt,
    };
  }

  // ── Get transactions ────────────────────────────────────────────────────────

  async getTransactions(params: {
    memberId?: string;
    page?: number;
    limit?: number;
    type?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    // Resolve portefeuille id if memberId provided
    let portefeuilleId: string | undefined;
    if (params.memberId) {
      const pf = await this.prisma.portefeuille.findUnique({
        where: { membreId: params.memberId },
        select: { id: true },
      });
      if (!pf) throw new NotFoundException(`Portefeuille introuvable`);
      portefeuilleId = pf.id;
    }

    const where: Prisma.TransactionPortefeuilleWhereInput = {};
    if (portefeuilleId) where.portefeuilleId = portefeuilleId;
    if (params.type) where.type = params.type as TransactionType;

    const [transactions, total] = await Promise.all([
      this.prisma.transactionPortefeuille.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          portefeuille: {
            include: {
              membre: {
                include: {
                  client: { select: { id: true, prenom: true, nom: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.transactionPortefeuille.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        montant: Number(t.montant),
        description: t.description,
        referenceId: t.referenceId,
        createdAt: t.createdAt,
        membre: {
          id: t.portefeuille.membre.id,
          prenom: t.portefeuille.membre.client.prenom,
          nom: t.portefeuille.membre.client.nom,
        },
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Earnings by level ───────────────────────────────────────────────────────

  async getEarningsByLevel(memberId: string) {
    const pf = await this.prisma.portefeuille.findUnique({
      where: { membreId: memberId },
      select: { id: true },
    });
    if (!pf) throw new NotFoundException(`Portefeuille introuvable`);

    const transactions = await this.prisma.transactionPortefeuille.groupBy({
      by: ['type'],
      where: { portefeuilleId: pf.id },
      _sum: { montant: true },
      _count: { id: true },
    });

    return transactions.map((t) => ({
      type: t.type,
      total: Number(t._sum.montant ?? 0),
      count: t._count.id,
    }));
  }

  // ── Credit wallet (standalone) ──────────────────────────────────────────────

  async creditWallet(
    memberId: string,
    montant: number,
    type: TransactionType,
    description: string,
    referenceId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      return this.creditWalletInTx(tx, memberId, montant, type, description, referenceId);
    });
  }

  // ── Credit wallet inside an existing transaction (used by matrix service) ───

  async creditWalletInTx(
    tx: Prisma.TransactionClient,
    memberId: string,
    montant: number,
    type: TransactionType,
    description: string,
    referenceId?: string,
  ) {
    const pf = await tx.portefeuille.findUnique({
      where: { membreId: memberId },
      select: { id: true },
    });
    if (!pf) throw new NotFoundException(`Portefeuille introuvable pour membre ${memberId}`);

    const montantDecimal = new Prisma.Decimal(montant);

    await tx.portefeuille.update({
      where: { id: pf.id },
      data: {
        soldeDisponible: { increment: montantDecimal },
        totalGagne: { increment: montantDecimal },
      },
    });

    await tx.transactionPortefeuille.create({
      data: {
        portefeuilleId: pf.id,
        type,
        montant: montantDecimal,
        description,
        referenceId,
      },
    });
  }
}
