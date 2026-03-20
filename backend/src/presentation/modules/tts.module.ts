import { Module } from '@nestjs/common';
import { TtsController } from '../controllers/tts.controller';
import { SupertoneService } from '../../infrastructure/supertone/supertone.service';
import { SupertoneConfig } from '../../infrastructure/config/supertone.config';
import { QwenTtsConfig } from '../../infrastructure/config/qwen-tts.config';
import { QwenTtsService } from '../../infrastructure/qwen/qwen-tts.service';
import { KokoroConfig } from '../../infrastructure/config/kokoro.config';
import { KokoroService } from '../../infrastructure/kokoro/kokoro.service';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IQwenTtsPort } from '../../domain/ports/qwen-tts.port';
import { SynthesizeSpeechUseCase } from '../../application/use-cases/synthesize-speech.use-case';

@Module({
  controllers: [TtsController],
  providers: [
    SupertoneConfig,
    SupertoneService,
    { provide: ISupertonePort, useExisting: SupertoneService },

    QwenTtsConfig,
    QwenTtsService,
    { provide: IQwenTtsPort, useExisting: QwenTtsService },

    KokoroConfig,
    KokoroService,
    { provide: IKokoroPort, useExisting: KokoroService },

    SynthesizeSpeechUseCase,
  ],
  exports: [ISupertonePort, IKokoroPort, IQwenTtsPort],
})
export class TtsModule {}
