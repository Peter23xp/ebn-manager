import { Module } from '@nestjs/common';
import { MlmController } from './mlm.controller';
import { MlmService } from './mlm.service';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmWalletService } from './mlm-wallet.service';
import { MlmClaimService } from './mlm-claim.service';
import { ReinvestReleaseService } from './reinvest-release.service';
import { KpayModule } from '../kpay/kpay.module';
import { MlmPlacementService } from './mlm-placement.service';
import { MlmCalendarService } from './mlm-calendar.service';

@Module({
  imports: [KpayModule],
  controllers: [MlmController],
  providers: [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService, ReinvestReleaseService, MlmPlacementService, MlmCalendarService],
  exports: [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService, ReinvestReleaseService, MlmPlacementService, MlmCalendarService],
})
export class MlmModule {}
