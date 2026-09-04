import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import {
  EntreeStockDto,
  TransfertDto,
  ReceptionTransfertDto,
  UpdateSeuilDto,
  InventaireDto,
  CreateProduitDto,
} from './dto/stock.dto';
import { TypeMouvement, StatutTransfert } from '@prisma/client';

// Préfixes SKU par catégorie (3 lettres majuscules)
const CAT_PREFIX: Record<string, string> = {
  smartphones: 'SM',
  accessoires: 'ACC',
  audio: 'AUD',
  informatique: 'INFO',
  tablettes: 'TAB',
  tv: 'TV',
  autre: 'DIV',
};

function getCatPrefix(categorie: string): string {
  return CAT_PREFIX[categorie.toLowerCase()] ?? categorie.slice(0, 3).toUpperCase().replace(/\s+/g, '');
}

@Injectable()
export class StocksService {
  constructor(private prisma: PrismaService) {}

  async getInventaire(query: {
    siteId?: string;
    produitId?: string;
    categorie?: string;
    search?: string;
    statut?: string;
    alerteOnly?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { siteId, produitId, categorie, search, statut, alerteOnly, page = 1, limit = 50, sortBy, sortOrder = 'asc' } = query;

    // Construction du filtre pour les produits
    const produitWhere: any = { actif: true };
    if (produitId) produitWhere.id = produitId;
    if (categorie) produitWhere.categorie = categorie;
    if (search) {
      produitWhere.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Récupérer TOUS les produits actifs (comme dans searchProduits)
    const produits = await this.prisma.produit.findMany({
      where: produitWhere,
      include: {
        stockSites: {
          where: siteId ? { siteId } : {},
          select: { 
            siteId: true,
            quantite: true, 
            seuilAlerte: true,
            updatedAt: true,
            site: { select: { id: true, nom: true, ville: true } },
          },
        },
      },
      orderBy: sortBy === 'nom' ? { nom: sortOrder } : undefined,
    });

    // Mapper les produits avec leur stock par site
    let allStocks = produits.flatMap((p) => {
      // Si le produit n'a pas de stock sur les sites demandés, on l'affiche quand même avec stock = 0
      if (p.stockSites.length === 0 && siteId) {
        return [{
          produitId: p.id,
          sku: p.sku,
          produitNom: p.nom,
          categorie: p.categorie,
          prixVente: Number(p.prixVente),
          siteId: siteId,
          siteNom: '—',
          quantite: 0,
          seuilAlerte: 5,
          statut: 'RUPTURE',
          updatedAt: new Date().toISOString(),
        }];
      }
      
      return p.stockSites.map((stock) => {
        const stockStatut = stock.quantite === 0 ? 'RUPTURE' : stock.quantite <= stock.seuilAlerte ? 'ALERTE' : 'OK';
        return {
          produitId: p.id,
          sku: p.sku,
          produitNom: p.nom,
          categorie: p.categorie,
          prixVente: Number(p.prixVente),
          siteId: stock.siteId,
          siteNom: stock.site.nom,
          quantite: stock.quantite,
          seuilAlerte: stock.seuilAlerte,
          statut: stockStatut,
          updatedAt: stock.updatedAt.toISOString(),
        };
      });
    });

    // Tri par quantité si demandé
    if (sortBy === 'quantite') {
      allStocks.sort((a, b) => sortOrder === 'asc' ? a.quantite - b.quantite : b.quantite - a.quantite);
    }

    // Filtrage par statut
    let filtered = allStocks;
    if (alerteOnly) {
      filtered = filtered.filter((s) => s.quantite <= s.seuilAlerte);
    }
    if (statut === 'RUPTURE') {
      filtered = filtered.filter((s) => s.quantite === 0);
    } else if (statut === 'ALERTE') {
      filtered = filtered.filter((s) => s.quantite > 0 && s.quantite <= s.seuilAlerte);
    } else if (statut === 'OK') {
      filtered = filtered.filter((s) => s.quantite > s.seuilAlerte);
    }

    const totalAlertes = allStocks.filter((s) => s.quantite > 0 && s.quantite <= s.seuilAlerte).length;
    const totalRuptures = allStocks.filter((s) => s.quantite === 0).length;

    const total = filtered.length;
    const { skip, take } = paginate(page, limit);
    const stocks = filtered.slice(skip, skip + take);

    return {
      stocks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), totalAlertes, totalRuptures },
    };
  }

  async getProduitStocks(produitId: string) {
    const produit = await this.prisma.produit.findUnique({
      where: { id: produitId },
    });
    if (!produit) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Produit introuvable' });
    }

    const stocks = await this.prisma.stockSite.findMany({
      where: { produitId },
      include: {
        site: { select: { id: true, nom: true, ville: true } },
      },
      orderBy: { site: { nom: 'asc' } },
    });

    const totalStock = stocks.reduce((a, s) => a + s.quantite, 0);

    const stocksBySite = stocks.map((s) => ({
      siteId: s.siteId,
      siteNom: s.site.nom,
      quantite: s.quantite,
      seuilAlerte: s.seuilAlerte,
      statut: s.quantite === 0 ? 'RUPTURE' : s.quantite <= s.seuilAlerte ? 'ALERTE' : 'OK',
      updatedAt: s.updatedAt.toISOString(),
    }));

    return {
      produit: {
        id: produit.id,
        sku: produit.sku,
        nom: produit.nom,
        description: produit.description ?? undefined,
        categorie: produit.categorie,
        prixVente: Number(produit.prixVente),
        prixAchat: Number(produit.prixAchat),
      },
      stocksBySite,
      totalStock,
    };
  }

  async getMovements(produitId: string, query: {
    type?: string;
    siteId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { type, siteId, dateFrom, dateTo, page = 1, limit = 10 } = query;

    const produit = await this.prisma.produit.findUnique({ where: { id: produitId } });
    if (!produit) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Produit introuvable' });
    }

    const where: any = { produitId };
    if (type) where.type = type;
    if (siteId) where.siteId = siteId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.mouvementStock.count({ where }),
      this.prisma.mouvementStock.findMany({
        where,
        include: {
          agent: { select: { nom: true } },
          site: { select: { id: true, nom: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const mouvements = rows.map((m) => ({
      id: m.id,
      type: m.type,
      quantite: m.quantite,
      quantiteAvant: m.quantiteAvant,
      quantiteApres: m.quantiteApres,
      reference: m.reference ?? undefined,
      agentNom: m.agent.nom,
      siteId: m.siteId,
      siteNom: m.site.nom,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      mouvements,
      meta: { total, page, totalPages: Math.ceil(total / limit) },
    };
  }

  async entreeStock(dto: EntreeStockDto, agentId: string) {
    // Vérifier site et produit
    const [site, produit] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: dto.siteId } }),
      this.prisma.produit.findUnique({ where: { id: dto.produitId } }),
    ]);

    if (!site) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
    }
    if (!produit) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Produit introuvable' });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Upsert du stock
      const existingStock = await tx.stockSite.findUnique({
        where: { produitId_siteId: { produitId: dto.produitId, siteId: dto.siteId } },
      });

      const quantiteAvant = existingStock?.quantite ?? 0;
      const quantiteApres = quantiteAvant + dto.quantite;

      const stock = await tx.stockSite.upsert({
        where: { produitId_siteId: { produitId: dto.produitId, siteId: dto.siteId } },
        create: {
          produitId: dto.produitId,
          siteId: dto.siteId,
          quantite: dto.quantite,
          seuilAlerte: 5,
        },
        update: {
          quantite: { increment: dto.quantite },
        },
      });

      // Créer le mouvement
      const mouvement = await tx.mouvementStock.create({
        data: {
          type: TypeMouvement.ENTREE,
          quantite: dto.quantite,
          quantiteAvant,
          quantiteApres,
          reference: dto.referenceFournisseur,
          produitId: dto.produitId,
          siteId: dto.siteId,
          agentId,
        },
        include: {
          agent: { select: { nom: true } },
          site: { select: { id: true, nom: true } },
        },
      });

      return { stock, mouvement, quantiteApres };
    });

    const statut = result.quantiteApres === 0
      ? 'RUPTURE'
      : result.quantiteApres <= result.stock.seuilAlerte
        ? 'ALERTE'
        : 'OK';

    return {
      mouvement: {
        id: result.mouvement.id,
        type: result.mouvement.type,
        quantite: result.mouvement.quantite,
        quantiteAvant: result.mouvement.quantiteAvant,
        quantiteApres: result.mouvement.quantiteApres,
        reference: result.mouvement.reference ?? undefined,
        agentNom: result.mouvement.agent.nom,
        siteId: result.mouvement.siteId,
        siteNom: result.mouvement.site.nom,
        createdAt: result.mouvement.createdAt.toISOString(),
      },
      stockApres: result.quantiteApres,
      statut,
    };
  }

  async transfert(dto: TransfertDto, agentId: string) {
    if (dto.siteSourceId === dto.siteDestinationId) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: 'Le site source et destination doivent être différents',
      });
    }

    const [siteSource, siteDest, produit] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: dto.siteSourceId } }),
      this.prisma.site.findUnique({ where: { id: dto.siteDestinationId } }),
      this.prisma.produit.findUnique({ where: { id: dto.produitId } }),
    ]);

    if (!siteSource) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site source introuvable' });
    }
    if (!siteDest) {
      throw new NotFoundException({
        code: 'ERR_NOT_FOUND',
        message: 'Site destination introuvable',
      });
    }
    if (!produit) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Produit introuvable' });
    }

    // Vérifier stock source
    const stockSource = await this.prisma.stockSite.findUnique({
      where: {
        produitId_siteId: { produitId: dto.produitId, siteId: dto.siteSourceId },
      },
    });

    if (!stockSource || stockSource.quantite < dto.quantite) {
      throw new ConflictException({
        code: 'ERR_STOCK_INSUFFISANT',
        message: `Stock insuffisant sur le site source. Disponible: ${stockSource?.quantite ?? 0}`,
      });
    }

    const transfertRecord = await this.prisma.$transaction(async (tx) => {
      // Déduire du stock source
      const quantiteAvantSource = stockSource.quantite;
      const quantiteApresSource = quantiteAvantSource - dto.quantite;

      await tx.stockSite.update({
        where: {
          produitId_siteId: { produitId: dto.produitId, siteId: dto.siteSourceId },
        },
        data: { quantite: quantiteApresSource },
      });

      // Créer le transfert
      const transfert = await tx.transfertStock.create({
        data: {
          produitId: dto.produitId,
          siteSourceId: dto.siteSourceId,
          siteDestinationId: dto.siteDestinationId,
          quantiteEnvoyee: dto.quantite,
          motif: dto.motif,
          initiateurId: agentId,
          statut: StatutTransfert.EN_TRANSIT,
        },
        include: {
          produit: { select: { id: true, nom: true, sku: true } },
          siteSource: { select: { id: true, nom: true } },
          siteDestination: { select: { id: true, nom: true } },
        },
      });

      // Mouvement TRANSFERT_DEPART
      await tx.mouvementStock.create({
        data: {
          type: TypeMouvement.TRANSFERT_DEPART,
          quantite: dto.quantite,
          quantiteAvant: quantiteAvantSource,
          quantiteApres: quantiteApresSource,
          reference: transfert.id,
          produitId: dto.produitId,
          siteId: dto.siteSourceId,
          agentId,
        },
      });

      return transfert;
    });

    return transfertRecord;
  }

  async recevoirTransfert(
    transfertId: string,
    dto: ReceptionTransfertDto,
    agentId: string,
  ) {
    const transfert = await this.prisma.transfertStock.findUnique({
      where: { id: transfertId },
    });

    if (!transfert) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Transfert introuvable' });
    }

    if (transfert.statut !== StatutTransfert.EN_TRANSIT) {
      throw new ConflictException({
        code: 'ERR_CONFLICT',
        message: `Ce transfert est déjà ${transfert.statut}`,
      });
    }

    if (dto.quantiteRecue > transfert.quantiteEnvoyee) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: `La quantité reçue (${dto.quantiteRecue}) ne peut pas dépasser la quantité envoyée (${transfert.quantiteEnvoyee})`,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Ajouter au stock destination
      const existingStock = await tx.stockSite.findUnique({
        where: {
          produitId_siteId: {
            produitId: transfert.produitId,
            siteId: transfert.siteDestinationId,
          },
        },
      });

      const quantiteAvant = existingStock?.quantite ?? 0;
      const quantiteApres = quantiteAvant + dto.quantiteRecue;

      await tx.stockSite.upsert({
        where: {
          produitId_siteId: {
            produitId: transfert.produitId,
            siteId: transfert.siteDestinationId,
          },
        },
        create: {
          produitId: transfert.produitId,
          siteId: transfert.siteDestinationId,
          quantite: dto.quantiteRecue,
          seuilAlerte: 5,
        },
        update: { quantite: { increment: dto.quantiteRecue } },
      });

      // Mouvement TRANSFERT_ARRIVEE
      await tx.mouvementStock.create({
        data: {
          type: TypeMouvement.TRANSFERT_ARRIVEE,
          quantite: dto.quantiteRecue,
          quantiteAvant,
          quantiteApres,
          reference: transfertId,
          produitId: transfert.produitId,
          siteId: transfert.siteDestinationId,
          agentId,
        },
      });

      // Mettre à jour le transfert
      return tx.transfertStock.update({
        where: { id: transfertId },
        data: {
          statut: StatutTransfert.RECU,
          quantiteRecue: dto.quantiteRecue,
          observations: dto.observations,
          dateReception: new Date(),
        },
        include: {
          produit: { select: { id: true, nom: true, sku: true } },
          siteSource: { select: { id: true, nom: true } },
          siteDestination: { select: { id: true, nom: true } },
        },
      });
    });

    return updated;
  }

  async getAlertes(query: { siteId?: string; type?: string; page?: number; limit?: number }) {
    const { siteId, type, page = 1, limit = 50 } = query;

    const stocks = await this.prisma.stockSite.findMany({
      where: {
        ...(siteId ? { siteId } : {}),
        produit: { actif: true },
      },
      include: {
        produit: { select: { id: true, nom: true, sku: true, categorie: true, actif: true } },
        site: { select: { id: true, nom: true, ville: true } },
      },
    });

    const allAlertes = stocks
      .filter((s) => s.quantite <= s.seuilAlerte)
      .map((s) => ({
        produitId: s.produitId,
        produitNom: s.produit.nom,
        sku: s.produit.sku,
        siteId: s.siteId,
        siteNom: s.site.nom,
        stockActuel: s.quantite,
        seuilAlerte: s.seuilAlerte,
        type: s.quantite === 0 ? 'RUPTURE' : 'ALERTE',
        depuis: s.updatedAt.toISOString(),
        isOrdering: false,
      }))
      .sort((a, b) => a.stockActuel - b.stockActuel);

    const totalRuptures = allAlertes.filter((a) => a.type === 'RUPTURE').length;
    const totalAlertes = allAlertes.filter((a) => a.type === 'ALERTE').length;

    let filtered = allAlertes;
    if (type === 'RUPTURE') filtered = allAlertes.filter((a) => a.type === 'RUPTURE');
    else if (type === 'ALERTE') filtered = allAlertes.filter((a) => a.type === 'ALERTE');

    const { skip, take } = paginate(page, limit);
    const alertes = filtered.slice(skip, skip + take);

    return {
      alertes,
      summary: { totalRuptures, totalAlertes },
    };
  }

  async updateSeuil(siteId: string, produitId: string, dto: UpdateSeuilDto) {
    const stock = await this.prisma.stockSite.findUnique({
      where: { produitId_siteId: { produitId, siteId } },
    });

    if (!stock) {
      // Créer l'entrée si elle n'existe pas
      const [site, produit] = await Promise.all([
        this.prisma.site.findUnique({ where: { id: siteId } }),
        this.prisma.produit.findUnique({ where: { id: produitId } }),
      ]);

      if (!site) {
        throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
      }
      if (!produit) {
        throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Produit introuvable' });
      }

      return this.prisma.stockSite.create({
        data: { produitId, siteId, quantite: 0, seuilAlerte: dto.seuilAlerte },
      });
    }

    return this.prisma.stockSite.update({
      where: { produitId_siteId: { produitId, siteId } },
      data: { seuilAlerte: dto.seuilAlerte },
    });
  }

  async inventairePhysique(dto: InventaireDto, agentId: string) {
    // Vérifier que le site existe
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
    }

    const produitIds = dto.lignes.map((l) => l.produitId);
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: produitIds } },
    });

    if (produits.length !== produitIds.length) {
      const foundIds = new Set(produits.map((p) => p.id));
      const missing = produitIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException({
        code: 'ERR_NOT_FOUND',
        message: `Produits introuvables: ${missing.join(', ')}`,
      });
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const ajustements = [];

      for (const ligne of dto.lignes) {
        const existingStock = await tx.stockSite.findUnique({
          where: { produitId_siteId: { produitId: ligne.produitId, siteId: dto.siteId } },
        });

        const quantiteAvant = existingStock?.quantite ?? 0;
        const quantiteApres = ligne.quantiteComptee;
        const delta = quantiteApres - quantiteAvant;

        if (delta === 0) {
          ajustements.push({ produitId: ligne.produitId, delta: 0, ajuste: false });
          continue;
        }

        await tx.stockSite.upsert({
          where: { produitId_siteId: { produitId: ligne.produitId, siteId: dto.siteId } },
          create: {
            produitId: ligne.produitId,
            siteId: dto.siteId,
            quantite: ligne.quantiteComptee,
            seuilAlerte: 5,
          },
          update: { quantite: ligne.quantiteComptee },
        });

        await tx.mouvementStock.create({
          data: {
            type: TypeMouvement.AJUSTEMENT_INVENTAIRE,
            quantite: Math.abs(delta),
            quantiteAvant,
            quantiteApres,
            reference: `INVENTAIRE-${dto.dateInventaire}`,
            produitId: ligne.produitId,
            siteId: dto.siteId,
            agentId,
          },
        });

        ajustements.push({
          produitId: ligne.produitId,
          quantiteAvant,
          quantiteApres,
          delta,
          ajuste: true,
        });
      }

      return ajustements;
    });

    return {
      message: 'Inventaire physique enregistré',
      siteId: dto.siteId,
      dateInventaire: dto.dateInventaire,
      ajustements: results,
      totalAjustes: results.filter((r) => r.ajuste).length,
    };
  }

  // ── Recherche produits ────────────────────────────────────────────────────────

  async searchProduits(q: string | undefined, siteId: string, limit = 50, stockOnly = false) {
    if (!siteId) return { produits: [] };

    const where: any = { actif: true };
    if (q && q.trim()) {
      where.OR = [
        { nom: { contains: q.trim(), mode: 'insensitive' } },
        { sku: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    const produits = await this.prisma.produit.findMany({
      where,
      include: {
        stockSites: {
          where: { siteId },
          select: { quantite: true, seuilAlerte: true },
        },
      },
      take: limit,
      orderBy: { nom: 'asc' },
    });

    let result = produits.map((p) => {
      const stock = p.stockSites[0];
      const stockDisponible = stock?.quantite ?? 0;
      const seuilAlerte = stock?.seuilAlerte ?? 5;
      const statut = stockDisponible === 0 ? 'RUPTURE' : stockDisponible <= seuilAlerte ? 'ALERTE' : 'OK';
      return {
        id: p.id,
        sku: p.sku,
        nom: p.nom,
        categorie: p.categorie,
        prixVente: Number(p.prixVente),
        stockDisponible,
        seuilAlerte,
        statut,
      };
    });

    if (stockOnly) result = result.filter((p) => p.stockDisponible > 0);

    return { produits: result };
  }

  // ── Catégories ────────────────────────────────────────────────────────────────

  async getCategories(): Promise<string[]> {
    let rows = await this.prisma.categorie.findMany({
      orderBy: { nom: 'asc' },
      select: { nom: true },
    });

    // Transition : peupler la table depuis les catégories portées par les produits
    if (rows.length === 0) {
      const distinct = await this.prisma.produit.findMany({
        select: { categorie: true },
        distinct: ['categorie'],
        orderBy: { categorie: 'asc' },
      });
      if (distinct.length > 0) {
        await this.prisma.categorie.createMany({
          data: distinct.map((d: { categorie: string }) => ({ nom: d.categorie })),
          skipDuplicates: true,
        });
        rows = await this.prisma.categorie.findMany({
          orderBy: { nom: 'asc' },
          select: { nom: true },
        });
      }
    }
    return rows.map((r: { nom: string }) => r.nom);
  }

  async addCategorie(nom: string): Promise<{ categories: string[] }> {
    const existing = await this.getCategories();
    if (existing.map((c) => c.toLowerCase()).includes(nom.toLowerCase())) {
      throw new ConflictException({ code: 'CATEGORIE_EXISTE', message: 'Cette catégorie existe déjà.' });
    }
    await this.prisma.categorie.create({ data: { nom } });
    return { categories: [...existing, nom].sort() };
  }

  async deleteCategorie(nom: string): Promise<{ categories: string[] }> {
    const count = await this.prisma.produit.count({ where: { categorie: nom, actif: true } });
    if (count > 0) {
      throw new BadRequestException({
        code: 'CATEGORIE_EN_USE',
        message: `Impossible de supprimer : ${count} produit(s) actif(s) dans cette catégorie.`,
      });
    }
    const row = await this.prisma.categorie.findUnique({ where: { nom } });
    if (row) {
      await this.prisma.categorie.delete({ where: { id: row.id } });
    }
    const remaining = await this.getCategories();
    return { categories: remaining.filter((c) => c !== nom) };
  }

  // ── Génération SKU preview ────────────────────────────────────────────────────

  async generateSkuPreview(categorie: string): Promise<{ sku: string }> {
    const prefix = getCatPrefix(categorie);
    const count = await this.prisma.produit.count({ where: { categorie } });
    const seq = String(count + 1).padStart(3, '0');
    return { sku: `TSG-${prefix}-${seq}` };
  }

  // ── Création produit ──────────────────────────────────────────────────────────

  async createProduit(
    dto: CreateProduitDto,
    user: { id: string; role: string; siteId?: string },
  ) {
    // Générer le SKU final (atomique dans la transaction)
    const prefix = getCatPrefix(dto.categorie);

    // Résoudre les sites cibles
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    let siteIds: string[];

    if (isSuperAdmin) {
      // Tous les sites actifs
      const sites = await this.prisma.site.findMany({ where: { actif: true }, select: { id: true } });
      siteIds = sites.map((s) => s.id);
    } else {
      if (!user.siteId) throw new BadRequestException({ code: 'NO_SITE', message: 'Site utilisateur introuvable.' });
      siteIds = [user.siteId];
    }

    // Valider que tous les siteIds dans dto.seuilsParSite appartiennent à siteIds
    for (const s of dto.seuilsParSite) {
      if (!siteIds.includes(s.siteId)) {
        throw new BadRequestException({ code: 'SITE_INVALIDE', message: `Site ${s.siteId} non autorisé.` });
      }
    }

    const produit = await this.prisma.$transaction(async (tx) => {
      // SKU atomique : compter dans la transaction
      const count = await tx.produit.count({ where: { categorie: dto.categorie } });
      const seq = String(count + 1).padStart(3, '0');
      const sku = `TSG-${prefix}-${seq}`;

      const newProduit = await tx.produit.create({
        data: {
          sku,
          nom: dto.nom,
          categorie: dto.categorie,
          description: dto.description ?? null,
          prixVente: dto.prixVente,
          prixAchat: dto.prixAchat,
          actif: true,
        },
      });

      await tx.categorie.upsert({
        where: { nom: dto.categorie },
        update: {},
        create: { nom: dto.categorie },
      }).catch(() => undefined); // best-effort : la table n'est qu'un index des catégories

      // Créer StockSite pour chaque site cible
      for (const siteId of siteIds) {
        const seuilConfig = dto.seuilsParSite.find((s) => s.siteId === siteId);
        await tx.stockSite.create({
          data: {
            produitId: newProduit.id,
            siteId,
            quantite: 0,
            seuilAlerte: seuilConfig?.seuilAlerte ?? 5,
          },
        });
      }

      return newProduit;
    });

    return {
      produit: {
        id: produit.id,
        sku: produit.sku,
        nom: produit.nom,
        categorie: produit.categorie,
        prixVente: Number(produit.prixVente),
        prixAchat: Number(produit.prixAchat),
        sitesEnregistres: siteIds.length,
      },
    };
  }
}
