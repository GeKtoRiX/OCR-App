import { Module } from '@nestjs/common';
import { GatewayClientsModule } from '../gateway-clients.module';
import { GatewayAgenticController } from './gateway-agentic.controller';

@Module({
  imports: [GatewayClientsModule],
  controllers: [GatewayAgenticController],
})
export class GatewayAgenticModule {}
