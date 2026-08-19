import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ClientsModule } from './modules/clients/clients.module';
import { VentesModule } from './modules/ventes/ventes.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { ParrainageModule } from './modules/parrainage/parrainage.module';
import { FideliteModule } from './modules/fidelite/fidelite.module';
import { RapportsModule } from './modules/rapports/rapports.module';
import { PortalModule } from './modules/portal/portal.module';
import { UsersModule } from './modules/users/users.module';
import { SitesModule } from './modules/sites/sites.module';
import { ConfigAppModule } from './modules/config-app/config-app.module';
import { SupportModule } from './modules/support/support.module';
import { HealthModule } from './health/health.module';
import { MlmModule } from './modules/mlm/mlm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    DashboardModule,
    ClientsModule,
    VentesModule,
    StocksModule,
    ParrainageModule,
    FideliteModule,
    RapportsModule,
    PortalModule,
    UsersModule,
    SitesModule,
    ConfigAppModule,
    SupportModule,
    HealthModule,
    MlmModule,
  ],
})
export class AppModule {}
