import { Agent } from '@openai/agents';
import type { AgentWorkflowContext } from '../core/agent-ecosystem.types';
import {
  DeploymentReportSchema,
  PhaseOutputSchema,
} from '../core/agent-ecosystem.schemas';
import {
  analyzePhaseGuardrail,
  initializePhaseGuardrail,
  scaffoldPhaseGuardrail,
} from '../guardrails/phase-output.guardrails';
import { architectureTools } from '../tools/architecture-tools';
import { AgentRuntimeModels } from '../core/agent-ecosystem.types';
import { deploymentTools } from '../tools/deployment-tools';
import { deploymentOutputGuardrail } from '../guardrails/deployment-output.guardrails';

export function createAnalyzeCoordinator(models: AgentRuntimeModels) {
  const dependencyMapper = new Agent<
    AgentWorkflowContext,
    typeof PhaseOutputSchema
  >({
    name: 'Dependency Mapper',
    handoffDescription:
      'Builds the dependency tree for the requested autonomous agent ecosystem.',
    instructions: [
      'You are the dependency-mapping specialist.',
      'Use the project_context and model_policy tools before answering.',
      'Return a strict JSON object matching the requested schema.',
      'Focus on dependency order, capability boundaries, and handoff edges.',
    ].join(' '),
    model: models.mapper,
    modelSettings: {
      text: { verbosity: 'low' },
    },
    outputType: PhaseOutputSchema,
    outputGuardrails: [analyzePhaseGuardrail],
    tools: architectureTools,
  });

  return new Agent<AgentWorkflowContext, typeof PhaseOutputSchema>({
    name: 'Analyze Supervisor',
    handoffDescription:
      'Routes analysis work to the dependency mapper and enforces architecture planning discipline.',
    instructions: [
      'You are the chief architect for the analysis phase.',
      'Always hand off to the Dependency Mapper for final output.',
      'Ensure the result is aligned to the current NestJS repository.',
    ].join(' '),
    model: models.supervisor,
    modelSettings: {
      reasoning: { effort: 'high', summary: 'concise' },
      text: { verbosity: 'medium' },
    },
    handoffs: [dependencyMapper],
  });
}

export function createScaffoldCoordinator(models: AgentRuntimeModels) {
  const scaffoldingAgent = new Agent<
    AgentWorkflowContext,
    typeof PhaseOutputSchema
  >({
    name: 'Scaffold Planner',
    handoffDescription:
      'Creates the target filesystem scaffold and module boundaries.',
    instructions: [
      'You design the file scaffold for the autonomous agent ecosystem.',
      'Use the project_context and model_policy tools before answering.',
      'Return only the structured phase JSON.',
      'Include /core, /agents, /tools and the NestJS integration edge.',
    ].join(' '),
    model: models.scaffold,
    modelSettings: {
      text: { verbosity: 'low' },
    },
    outputType: PhaseOutputSchema,
    outputGuardrails: [scaffoldPhaseGuardrail],
    tools: architectureTools,
  });

  return new Agent<AgentWorkflowContext, typeof PhaseOutputSchema>({
    name: 'Scaffold Supervisor',
    handoffDescription:
      'Routes scaffold design to the dedicated planner.',
    instructions: [
      'You supervise the scaffold phase.',
      'Always hand off to the Scaffold Planner.',
      'Keep the result compatible with a backend/src/agentic bounded context.',
    ].join(' '),
    model: models.supervisor,
    modelSettings: {
      reasoning: { effort: 'high', summary: 'concise' },
      text: { verbosity: 'medium' },
    },
    handoffs: [scaffoldingAgent],
  });
}

export function createInitializationCoordinator(models: AgentRuntimeModels) {
  const initializationArchitect = new Agent<
    AgentWorkflowContext,
    typeof PhaseOutputSchema
  >({
    name: 'Initialization Architect',
    handoffDescription:
      'Defines agent initialization code, model allocation, tracing, and guardrail wiring.',
    instructions: [
      'You specify the initialization layer for the autonomous ecosystem.',
      'Use the project_context and model_policy tools before answering.',
      'Decision-heavy logic must use the decision model with reasoning effort high.',
      'Return only the structured phase JSON.',
    ].join(' '),
    model: models.planner,
    modelSettings: {
      reasoning: { effort: 'high', summary: 'concise' },
      text: { verbosity: 'medium' },
    },
    outputType: PhaseOutputSchema,
    outputGuardrails: [initializePhaseGuardrail],
    tools: architectureTools,
  });

  return new Agent<AgentWorkflowContext, typeof PhaseOutputSchema>({
    name: 'Initialization Supervisor',
    handoffDescription:
      'Routes initialization planning to the architecture specialist.',
    instructions: [
      'You supervise the initialization phase.',
      'Always hand off to the Initialization Architect.',
      'Preserve tracing and guardrail requirements in the final output.',
    ].join(' '),
    model: models.supervisor,
    modelSettings: {
      reasoning: { effort: 'high', summary: 'concise' },
      text: { verbosity: 'medium' },
    },
    handoffs: [initializationArchitect],
  });
}

export function createDeploymentCoordinator(models: AgentRuntimeModels) {
  const deploymentSpecialist = new Agent<
    AgentWorkflowContext,
    typeof DeploymentReportSchema
  >({
    name: 'Deployment Specialist',
    handoffDescription:
      'Materializes the generated autonomous agent ecosystem using deployment tools.',
    instructions: [
      'You deploy the generated ecosystem to disk.',
      'You must call create_workspace_scaffold, then write_runtime_bundle, then summarize_runtime_bundle.',
      'After using the tools, return only the final deployment report JSON.',
    ].join(' '),
    model: models.scaffold,
    modelSettings: {
      toolChoice: 'required',
      text: { verbosity: 'low' },
    },
    outputType: DeploymentReportSchema,
    outputGuardrails: [deploymentOutputGuardrail],
    tools: deploymentTools,
  });

  return new Agent<AgentWorkflowContext, typeof DeploymentReportSchema>({
    name: 'Deployment Supervisor',
    handoffDescription:
      'Routes deployment work to the deployment specialist.',
    instructions: [
      'You supervise the deployment phase.',
      'Always hand off to the Deployment Specialist.',
      'The final result must reference the real generated files.',
    ].join(' '),
    model: models.supervisor,
    modelSettings: {
      reasoning: { effort: 'high', summary: 'concise' },
      text: { verbosity: 'medium' },
    },
    handoffs: [deploymentSpecialist],
  });
}
