import { Module } from '@nestjs/common';
import { PurchaseListService } from './purchase-list.service';
import { PurchaseListController } from './purchase-list.controller';

@Module({
  controllers: [PurchaseListController],
  providers: [PurchaseListService],
})
export class PurchaseListModule {}
