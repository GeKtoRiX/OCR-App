import { Module } from '@nestjs/common';
import { GatewayClientsModule } from '../gateway-clients.module';
import { GatewayDocumentController } from './gateway-document.controller';

@Module({
  imports: [GatewayClientsModule],
  controllers: [GatewayDocumentController],
})
export class GatewayDocumentModule {}
