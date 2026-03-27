import { Module } from '@nestjs/common';
import { GatewayClientsModule } from '../gateway-clients.module';
import { GatewayPracticeController } from './gateway-practice.controller';

@Module({
  imports: [GatewayClientsModule],
  controllers: [GatewayPracticeController],
})
export class GatewayPracticeModule {}
