import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { DatabaseModule } from './modules/database.module';
import { EditorModule } from './modules/editor.module';
import { OcrModule } from './modules/ocr.module';
import { HealthModule } from './modules/health.module';
import { TtsModule } from './modules/tts.module';
import { DocumentModule } from './modules/document.module';
import { VocabularyModule } from './modules/vocabulary.module';
import { AgentEcosystemModule } from '../agentic/presentation/modules/agent-ecosystem.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: 30,
    }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', '..', 'frontend', 'dist'),
      exclude: ['/api/(.*)'],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'data', 'editor-assets'),
      serveRoot: '/editor-assets',
    }),
    DatabaseModule,
    EditorModule,
    OcrModule,
    HealthModule,
    TtsModule,
    DocumentModule,
    VocabularyModule,
    AgentEcosystemModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
