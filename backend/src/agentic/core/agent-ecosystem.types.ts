import type { PhaseOutput, WorkflowStage } from './agent-ecosystem.schemas';

export interface AgentWorkflowContext {
  projectName: string;
  runtime: 'node';
  framework: 'nestjs';
  requestedBy: 'chief-architect';
}

export interface AgentRuntimeModels {
  supervisor: string;
  planner: string;
  scaffold: string;
  mapper: string;
}

export interface AgentRuntimeSettings {
  models: AgentRuntimeModels;
  tracingWorkflowName: string;
  deploymentRoot: string;
}

export interface PhaseExecutionInput {
  request: string;
  previousPhase?: PhaseOutput;
  stage: WorkflowStage;
}

export interface DeploymentRequest {
  request: string;
  workspaceName?: string;
}
