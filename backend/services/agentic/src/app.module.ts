import { Module } from '@nestjs/common';
import { AgentEcosystemService } from '@backend/agentic/application/agent-ecosystem.service';
import { AgentEcosystemConfig } from '@backend/agentic/core/agent-ecosystem.config';
import { AgenticMessageController } from './agentic.message.controller';

@Module({
  controllers: [AgenticMessageController],
  providers: [AgentEcosystemConfig, AgentEcosystemService],
})
export class AppModule {}
