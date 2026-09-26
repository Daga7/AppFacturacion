import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { SalesModule } from '../sales/sales.module';
import { LoansModule } from '../loans/loans.module';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [SalesModule, LoansModule, CashModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
