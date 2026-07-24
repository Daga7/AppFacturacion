import { Module } from '@nestjs/common';
import { SpecialOrdersService } from './special-orders.service';
import { SpecialOrdersController } from './special-orders.controller';

@Module({
  controllers: [SpecialOrdersController],
  providers: [SpecialOrdersService],
})
export class SpecialOrdersModule {}
