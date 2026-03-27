import { Module } from '@nestjs/common';
import { GatewayClientsModule } from '../gateway-clients.module';
import { GatewayOcrController } from './gateway-ocr.controller';

@Module({
  imports: [GatewayClientsModule],
  controllers: [GatewayOcrController],
})
export class GatewayOcrModule {}
