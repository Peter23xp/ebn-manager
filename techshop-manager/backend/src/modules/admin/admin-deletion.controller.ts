import { Controller, Delete, Get, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminDeletionService } from './admin-deletion.service';

/** Suppression / désactivation des sites, utilisateurs, clients et produits — super admin uniquement. */
@Controller('admin/deletion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AdminDeletionController {
  constructor(private readonly deletion: AdminDeletionService) {}

  /** Ce qui empêcherait la suppression (affiché avant de confirmer). */
  @Get(':entity/:id')
  impact(@Param('entity') entity: string, @Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.deletion.impact(this.deletion.parseEntity(entity), id, user);
  }

  @Delete(':entity/:id')
  @HttpCode(200)
  remove(@Param('entity') entity: string, @Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.deletion.remove(this.deletion.parseEntity(entity), id, user);
  }

  @Patch(':entity/:id/deactivate')
  deactivate(@Param('entity') entity: string, @Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.deletion.deactivate(this.deletion.parseEntity(entity), id, user);
  }
}
