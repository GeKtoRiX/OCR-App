import { Module } from '@nestjs/common';
import { AgentEcosystemController } from '../controllers/agent-ecosystem.controller';
import { AgentEcosystemService } from '../../application/agent-ecosystem.service';
import { AgentEcosystemConfig } from '../../core/agent-ecosystem.config';

@Module({
  controllers: [AgentEcosystemController],
  providers: [AgentEcosystemConfig, AgentEcosystemService],
})
export class AgentEcosystemModule {}
