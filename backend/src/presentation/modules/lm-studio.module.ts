import { Module } from '@nestjs/common';
import { LMStudioConfig } from '../../infrastructure/config/lm-studio.config';
import { LMStudioClient } from '../../infrastructure/lm-studio/lm-studio.client';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';

@Module({
  providers: [
    LMStudioConfig,
    LMStudioClient,
    { provide: ILmStudioHealthPort, useExisting: LMStudioClient },
    { provide: ILmStudioChatPort, useExisting: LMStudioClient },
  ],
  exports: [
    LMStudioConfig,
    LMStudioClient,
    ILmStudioHealthPort,
    ILmStudioChatPort,
  ],
})
export class LmStudioModule {}
