import { Module } from '@nestjs/common';
import { MlmController } from './mlm.controller';
import { MlmService } from './mlm.service';

@Module({ controllers: [MlmController], providers: [MlmService], exports: [MlmService] })
export class MlmModule {}
