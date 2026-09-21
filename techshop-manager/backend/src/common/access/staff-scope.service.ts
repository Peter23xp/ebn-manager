import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertStaffSite, effectiveStaffSite, hasMinimumRole, StaffActor } from './staff-access';

@Injectable()
export class StaffScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async requireClient(actor: StaffActor, clientId: string, minimum: Role = Role.AGENT): Promise<void> {
    if (!hasMinimumRole(actor.role, minimum)) throw new ForbiddenException('Rôle insuffisant');
    effectiveStaffSite(actor);
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, siteInscriptionId: true },
    });
    if (!client) throw new NotFoundException('Client introuvable');
    assertStaffSite(actor, client.siteInscriptionId);
  }

  async requireSale(actor: StaffActor, saleId: string, minimum: Role = Role.AGENT): Promise<void> {
    if (!hasMinimumRole(actor.role, minimum)) throw new ForbiddenException('Rôle insuffisant');
    effectiveStaffSite(actor);
    const sale = await this.prisma.vente.findUnique({
      where: { id: saleId },
      select: { siteId: true, client: { select: { siteInscriptionId: true } } },
    });
    if (!sale) throw new NotFoundException('Vente introuvable');
    assertStaffSite(actor, sale.siteId);
    if (sale.client) assertStaffSite(actor, sale.client.siteInscriptionId);
  }

  async requireExistingPhone(actor: StaffActor, telephone: string, minimum: Role = Role.AGENT): Promise<void> {
    if (!hasMinimumRole(actor.role, minimum)) throw new ForbiddenException('Rôle insuffisant');
    effectiveStaffSite(actor);
    const client = await this.prisma.client.findUnique({
      where: { telephone },
      select: { id: true, siteInscriptionId: true },
    });
    if (!client) return;
    try {
      assertStaffSite(actor, client.siteInscriptionId);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      throw new ConflictException({ code: 'ERR_CONFLICT', message: 'Ce numéro de téléphone est déjà utilisé.' });
    }
  }
}
