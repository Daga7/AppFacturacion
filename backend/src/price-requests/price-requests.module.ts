import { Module } from '@nestjs/common';
import { PriceRequestsService } from './price-requests.service';
import { PriceRequestsController } from './price-requests.controller';

@Module({
  controllers: [PriceRequestsController],
  providers: [PriceRequestsService],
})
export class PriceRequestsModule {}
