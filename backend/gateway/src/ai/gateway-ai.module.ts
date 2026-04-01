import { Module } from '@nestjs/common';
import { GatewayAiController } from './gateway-ai.controller';

@Module({
  controllers: [GatewayAiController],
})
export class GatewayAiModule {}
