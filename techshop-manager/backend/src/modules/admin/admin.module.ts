import { Module } from '@nestjs/common';
import { AdminDeletionController } from './admin-deletion.controller';
import { AdminDeletionService } from './admin-deletion.service';

@Module({
  controllers: [AdminDeletionController],
  providers: [AdminDeletionService],
})
export class AdminModule {}
