import { applyDecorators, BadRequestException, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { assertMobileMoneyAvailable, isMobileMoneyMethod } from './mobile-money.policy';

const PAYMENT_METHOD_FIELD = 'mobile-money:payment-method-field';

@Injectable()
export class MobileMoneyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const field = this.reflector.get<string | null>(PAYMENT_METHOD_FIELD, context.getHandler());
    const body = context.switchToHttp().getRequest().body;
    if (!field || isMobileMoneyMethod(body?.[field])) {
      assertMobileMoneyAvailable();
    } else {
      const allowed = field === 'type' ? ['CASH'] : ['CASH', 'VIREMENT'];
      if (!allowed.includes(body?.[field])) {
        throw new BadRequestException({ code: 'ERR_PAYMENT_METHOD_REQUIRED', message: 'Choisissez explicitement un mode de paiement valide.' });
      }
    }
    return true;
  }
}

export function CheckMobileMoney(field?: 'modePaiement' | 'modeRemboursement' | 'type') {
  return applyDecorators(SetMetadata(PAYMENT_METHOD_FIELD, field ?? null), UseGuards(MobileMoneyGuard));
}
