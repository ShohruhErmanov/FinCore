import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter, FinancialPayloadInterceptor } from '@/common';
import { APP_ENV, type AppEnv } from '@/config';
import { PrismaService } from '@/database';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const env = app.get<AppEnv>(APP_ENV);

  app.setGlobalPrefix('api');

  // The API serves JSON to a separate SPA origin; it never renders HTML itself.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser(env.SESSION_SECRET));

  // Credentials require an explicit origin — a wildcard is rejected by browsers
  // and would expose the session cookie to any site.
  app.enableCors({
    origin: [env.FRONTEND_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  if (env.NODE_ENV !== 'production')
    app.useGlobalInterceptors(new FinancialPayloadInterceptor());

  if (env.SWAGGER_ENABLED) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('FinCore API')
        .setDescription('Xarajat va tushum boshqaruvi — Phase 18.1 foundation')
        .setVersion('0.1.0')
        .addCookieAuth('fincore_session')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { withCredentials: true } });
    logger.log(`Swagger: http://localhost:${env.PORT}/api/docs`);
  }

  app.enableShutdownHooks();

  await app.listen(env.PORT);
  const database = app.get(PrismaService).status;
  logger.log(`FinCore API ${env.NODE_ENV} rejimida http://localhost:${env.PORT}/api da ishlamoqda`);
  logger.log(`Database: ${database} | CORS origin: ${env.FRONTEND_URL}`);
}

void bootstrap();
