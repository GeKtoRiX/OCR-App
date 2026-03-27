import 'reflect-metadata';
import compression from 'compression';
import { Agent, setGlobalDispatcher } from 'undici';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RpcExceptionFilter } from './filters/rpc-exception.filter';

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
  app.useGlobalFilters(new RpcExceptionFilter());
  app.enableShutdownHooks();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`OCR Gateway running on http://localhost:${port}`);
}

bootstrap();
