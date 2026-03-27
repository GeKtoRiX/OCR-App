import { Module } from '@nestjs/common';
import { GatewayClientsModule } from '../gateway-clients.module';
import { GatewayTtsController } from './gateway-tts.controller';

@Module({
  imports: [GatewayClientsModule],
  controllers: [GatewayTtsController],
})
export class GatewayTtsModule {}
