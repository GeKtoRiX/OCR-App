import { Injectable } from '@nestjs/common';
import { resolve } from 'path';
import {
  AgentRuntimeModels,
  AgentRuntimeSettings,
} from './agent-ecosystem.types';

@Injectable()
export class AgentEcosystemConfig {
  getSettings(): AgentRuntimeSettings {
    return {
      models: this.getModels(),
      tracingWorkflowName:
        process.env.AGENT_TRACE_WORKFLOW_NAME ||
        'autonomous-agent-ecosystem',
      deploymentRoot: resolve(
        process.cwd(),
        process.env.AGENT_DEPLOY_ROOT || 'generated-agent-ecosystems',
      ),
    };
  }

  private getModels(): AgentRuntimeModels {
    return {
      supervisor: process.env.OPENAI_AGENT_SUPERVISOR_MODEL || 'gpt-5',
      planner: process.env.OPENAI_AGENT_PLANNER_MODEL || 'gpt-5',
      scaffold: process.env.OPENAI_AGENT_SCAFFOLD_MODEL || 'gpt-5-mini',
      mapper: process.env.OPENAI_AGENT_MAPPER_MODEL || 'gpt-5-nano',
    };
  }
}
