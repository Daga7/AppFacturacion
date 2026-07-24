import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { ReportsModule } from './reports/reports.module';
import { BranchesModule } from './branches/branches.module';
import { CustomersModule } from './customers/customers.module';
import { LoansModule } from './loans/loans.module';
import { CashModule } from './cash/cash.module';
import { TelegramModule } from './telegram/telegram.module';
import { TransfersModule } from './transfers/transfers.module';
import { SpecialOrdersModule } from './special-orders/special-orders.module';
import { PurchaseListModule } from './purchase-list/purchase-list.module';
import { PriceRequestsModule } from './price-requests/price-requests.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    CategoriesModule,
    InventoryModule,
    SalesModule,
    ReportsModule,
    BranchesModule,
    CustomersModule,
    LoansModule,
    CashModule,
    TelegramModule,
    TransfersModule,
    SpecialOrdersModule,
    PurchaseListModule,
    PriceRequestsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
