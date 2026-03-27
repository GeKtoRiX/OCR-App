import { Module } from '@nestjs/common';
import { TtsController } from '../controllers/tts.controller';
import { SupertoneService } from '../../infrastructure/supertone/supertone.service';
import { SupertoneConfig } from '../../infrastructure/config/supertone.config';
import { F5TtsConfig } from '../../infrastructure/config/f5-tts.config';
import { F5TtsService } from '../../infrastructure/f5/f5-tts.service';
import { KokoroConfig } from '../../infrastructure/config/kokoro.config';
import { KokoroService } from '../../infrastructure/kokoro/kokoro.service';
import { VoxtralTtsConfig } from '../../infrastructure/config/voxtral-tts.config';
import { VoxtralTtsService } from '../../infrastructure/voxtral/voxtral-tts.service';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IF5TtsPort } from '../../domain/ports/f5-tts.port';
import { IVoxtralTtsPort } from '../../domain/ports/voxtral-tts.port';
import { SynthesizeSpeechUseCase } from '../../application/use-cases/synthesize-speech.use-case';

@Module({
  controllers: [TtsController],
  providers: [
    SupertoneConfig,
    SupertoneService,
    { provide: ISupertonePort, useExisting: SupertoneService },

    F5TtsConfig,
    F5TtsService,
    { provide: IF5TtsPort, useExisting: F5TtsService },

    VoxtralTtsConfig,
    VoxtralTtsService,
    { provide: IVoxtralTtsPort, useExisting: VoxtralTtsService },

    KokoroConfig,
    KokoroService,
    { provide: IKokoroPort, useExisting: KokoroService },

    SynthesizeSpeechUseCase,
  ],
  exports: [ISupertonePort, IKokoroPort, IF5TtsPort, IVoxtralTtsPort],
})
export class TtsModule {}
