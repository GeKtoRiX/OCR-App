import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { GatewayAgenticModule } from './agentic/gateway-agentic.module';
import { GatewayAiModule } from './ai/gateway-ai.module';
import { GatewayDocumentModule } from './document/gateway-document.module';
import { GatewayEditorModule } from './editor/gateway-editor.module';
import { GatewayHealthModule } from './health/gateway-health.module';
import { GatewayOcrModule } from './ocr/gateway-ocr.module';
import { GatewayPracticeModule } from './practice/gateway-practice.module';
import { GatewayTtsModule } from './tts/gateway-tts.module';
import { GatewayVocabularyModule } from './vocabulary/gateway-vocabulary.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 30,
      },
    ]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', '..', 'frontend', 'dist'),
      exclude: ['/api/(.*)'],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'data', 'editor-assets'),
      serveRoot: '/editor-assets',
    }),
    GatewayAiModule,
    GatewayEditorModule,
    GatewayOcrModule,
    GatewayTtsModule,
    GatewayDocumentModule,
    GatewayVocabularyModule,
    GatewayPracticeModule,
    GatewayHealthModule,
    GatewayAgenticModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
