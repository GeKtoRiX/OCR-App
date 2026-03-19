import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './presentation/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`OCR Web App running on http://localhost:${port}`);
}

bootstrap();
