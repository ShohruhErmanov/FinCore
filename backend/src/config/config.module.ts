import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { APP_ENV } from './env.token';
import { validateEnv } from './env.validation';

/**
 * `forRoot` loads the .env files into process.env synchronously at module
 * definition time, so the factory below always sees the merged environment.
 * A bad configuration throws here and the process never reaches `listen()`.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [{ provide: APP_ENV, useFactory: () => validateEnv(process.env) }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
