import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './modules/database.module';
import { OcrModule } from './modules/ocr.module';
import { HealthModule } from './modules/health.module';
import { TtsModule } from './modules/tts.module';
import { DocumentModule } from './modules/document.module';
import { VocabularyModule } from './modules/vocabulary.module';
import { AgentEcosystemModule } from '../agentic/presentation/modules/agent-ecosystem.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', '..', 'frontend', 'dist'),
      exclude: ['/api/(.*)'],
    }),
    DatabaseModule,
    OcrModule,
    HealthModule,
    TtsModule,
    DocumentModule,
    VocabularyModule,
    AgentEcosystemModule,
  ],
})
export class AppModule {}
