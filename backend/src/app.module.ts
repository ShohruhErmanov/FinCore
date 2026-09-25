import { Inject, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CsrfGuard, PermissionsGuard } from '@/common';
import { APP_ENV, AppConfigModule, type AppEnv } from '@/config';
import { DatabaseModule } from '@/database';
import { AuthModule, SessionGuard } from '@/auth';
import { HealthModule } from './health/health.module';
import { MasterDataModule } from './master-data/master-data.module';
import { ExpensesModule } from './expenses/expenses.module';
import { BudgetModule } from './budget/budget.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { RevenuePlansModule } from './revenue-plans/revenue-plans.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ImportsModule } from './imports/imports.module';
import { TelegramModule } from './telegram/telegram.module';
import { NotificationEventsModule } from './notification-events/notification-events.module';
import { DailyRevenuesModule } from './daily-revenues/daily-revenues.module';
import { InvestorsModule } from './investors/investors.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        // Exactly one throttler: every entry here is counted on every route, so
        // a second "auth" limiter would be exhausted by ordinary traffic and
        // lock users out of logging in.
        throttlers: [
          { name: 'default', ttl: env.RATE_LIMIT_TTL_SECONDS * 1000, limit: env.RATE_LIMIT_MAX },
        ],
      }),
    }),
    AuthModule,
    HealthModule,
    MasterDataModule,
    ExpensesModule,
    BudgetModule,
    ReportsModule,
    AdminModule,
    RevenuePlansModule,
    NotificationsModule,
    TelegramModule,
    NotificationEventsModule,
    ImportsModule,
    DailyRevenuesModule,
    InvestorsModule,
    AuditModule,
  ],
  providers: [
    // Order matters: reject cross-site cookie mutations before authentication,
    // then authenticate, check permissions and rate-limit.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {
  constructor(@Inject(APP_ENV) readonly env: AppEnv) {}
}
