import { Module } from '@nestjs/common';
import { GatewayClientsModule } from '../gateway-clients.module';
import { GatewayHealthController } from './gateway-health.controller';

@Module({
  imports: [GatewayClientsModule],
  controllers: [GatewayHealthController],
})
export class GatewayHealthModule {}
