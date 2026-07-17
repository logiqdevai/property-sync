import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@bull-board/express';
import { AppModule } from './app.module';
import { BULL_BOARD_ADAPTER } from './core/queues/queues.constants';
import { bullBoardAuthMiddleware } from './core/queues/bull-board.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Property Sync API')
    .setDescription(
      'REST API for Property Sync — agency crawling, property normalization, CMS sync, and user integrations.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const enabledCors =
    process.env.NODE_ENV !== 'local'
      ? [process.env.APP_URL, process.env.LANDING_URL]
      : ['http://localhost:5173', 'http://localhost:3001'];

  app.enableCors({
    origin: enabledCors,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Access-Control-Allow-Origin',
    ],
  });

  const configService = app.get(ConfigService);
  const serverAdapter = app.get<ExpressAdapter>(BULL_BOARD_ADAPTER);
  app.use(
    '/admin/queues',
    bullBoardAuthMiddleware(configService),
    serverAdapter.getRouter(),
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}
bootstrap();
