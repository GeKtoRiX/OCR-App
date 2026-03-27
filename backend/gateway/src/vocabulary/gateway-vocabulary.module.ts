import { Module } from '@nestjs/common';
import { GatewayClientsModule } from '../gateway-clients.module';
import { GatewayVocabularyController } from './gateway-vocabulary.controller';

@Module({
  imports: [GatewayClientsModule],
  controllers: [GatewayVocabularyController],
})
export class GatewayVocabularyModule {}
