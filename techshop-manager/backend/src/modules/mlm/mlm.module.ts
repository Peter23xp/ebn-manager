import { Module } from '@nestjs/common';
import { MlmController } from './mlm.controller';
import { MlmService } from './mlm.service';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmWalletService } from './mlm-wallet.service';
import { MlmClaimService } from './mlm-claim.service';
import { KpayModule } from '../kpay/kpay.module';

@Module({
  imports: [KpayModule],
  controllers: [MlmController],
  providers: [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService],
  exports: [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService],
})
export class MlmModule {}
