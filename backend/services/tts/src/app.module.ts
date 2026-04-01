import { Module } from '@nestjs/common';
import {
  IKokoroPort as SharedKokoroPort,
  ISupertonePort as SharedSupertonePort,
} from '@ocr-app/shared';
import {
  SynthesizeSpeechUseCase,
} from '@backend/application/use-cases/synthesize-speech.use-case';
import { IKokoroPort } from '@backend/domain/ports/kokoro.port';
import { ISupertonePort } from '@backend/domain/ports/supertone.port';
import { KokoroConfig } from '@backend/infrastructure/config/kokoro.config';
import { SupertoneConfig } from '@backend/infrastructure/config/supertone.config';
import { KokoroService } from '@backend/infrastructure/kokoro/kokoro.service';
import { SupertoneService } from '@backend/infrastructure/supertone/supertone.service';
import { TtsMessageController } from './tts.message.controller';

@Module({
  controllers: [TtsMessageController],
  providers: [
    SupertoneConfig,
    SupertoneService,
    { provide: ISupertonePort, useExisting: SupertoneService },
    { provide: SharedSupertonePort, useExisting: ISupertonePort },
    KokoroConfig,
    KokoroService,
    { provide: IKokoroPort, useExisting: KokoroService },
    { provide: SharedKokoroPort, useExisting: IKokoroPort },
    SynthesizeSpeechUseCase,
  ],
})
export class AppModule {}
