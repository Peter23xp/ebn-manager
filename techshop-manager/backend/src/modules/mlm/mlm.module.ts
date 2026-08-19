import { Module } from '@nestjs/common';
import { MlmController } from './mlm.controller';
import { MlmService } from './mlm.service';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmWalletService } from './mlm-wallet.service';

@Module({
  controllers: [MlmController],
  providers: [MlmService, MlmMatrixService, MlmWalletService],
  exports: [MlmService, MlmMatrixService, MlmWalletService],
})
export class MlmModule {}
