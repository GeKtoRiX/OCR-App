import 'reflect-metadata';
import compression from 'compression';
import { Agent, setGlobalDispatcher } from 'undici';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './presentation/app.module';

setGlobalDispatcher(
  new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connections: 20,
  }),
);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(compression({ threshold: 1024 }));
  app.enableShutdownHooks();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`OCR Web App running on http://localhost:${port}`);
}

bootstrap();
