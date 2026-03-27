import { Module } from '@nestjs/common';
import {
  IF5TtsPort as SharedF5TtsPort,
  IKokoroPort as SharedKokoroPort,
  ISupertonePort as SharedSupertonePort,
  IVoxtralTtsPort as SharedVoxtralTtsPort,
} from '@ocr-app/shared';
import {
  SynthesizeSpeechUseCase,
} from '@backend/application/use-cases/synthesize-speech.use-case';
import { IF5TtsPort } from '@backend/domain/ports/f5-tts.port';
import { IKokoroPort } from '@backend/domain/ports/kokoro.port';
import { ISupertonePort } from '@backend/domain/ports/supertone.port';
import { IVoxtralTtsPort } from '@backend/domain/ports/voxtral-tts.port';
import { F5TtsConfig } from '@backend/infrastructure/config/f5-tts.config';
import { KokoroConfig } from '@backend/infrastructure/config/kokoro.config';
import { SupertoneConfig } from '@backend/infrastructure/config/supertone.config';
import { VoxtralTtsConfig } from '@backend/infrastructure/config/voxtral-tts.config';
import { F5TtsService } from '@backend/infrastructure/f5/f5-tts.service';
import { KokoroService } from '@backend/infrastructure/kokoro/kokoro.service';
import { SupertoneService } from '@backend/infrastructure/supertone/supertone.service';
import { VoxtralTtsService } from '@backend/infrastructure/voxtral/voxtral-tts.service';
import { TtsMessageController } from './tts.message.controller';

@Module({
  controllers: [TtsMessageController],
  providers: [
    SupertoneConfig,
    SupertoneService,
    { provide: ISupertonePort, useExisting: SupertoneService },
    { provide: SharedSupertonePort, useExisting: ISupertonePort },
    F5TtsConfig,
    F5TtsService,
    { provide: IF5TtsPort, useExisting: F5TtsService },
    { provide: SharedF5TtsPort, useExisting: IF5TtsPort },
    VoxtralTtsConfig,
    VoxtralTtsService,
    { provide: IVoxtralTtsPort, useExisting: VoxtralTtsService },
    { provide: SharedVoxtralTtsPort, useExisting: IVoxtralTtsPort },
    KokoroConfig,
    KokoroService,
    { provide: IKokoroPort, useExisting: KokoroService },
    { provide: SharedKokoroPort, useExisting: IKokoroPort },
    SynthesizeSpeechUseCase,
  ],
})
export class AppModule {}
