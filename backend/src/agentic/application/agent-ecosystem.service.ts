import { Injectable } from '@nestjs/common';
import { Agent, run, withTrace } from '@openai/agents';
import {
  AutonomousDeploymentResult,
  AutonomousDeploymentResultSchema,
  AutonomousArchitecturePlan,
  AutonomousArchitecturePlanSchema,
  DeploymentReport,
  PhaseOutput,
} from '../core/agent-ecosystem.schemas';
import { AgentEcosystemConfig } from '../core/agent-ecosystem.config';
import {
  createAnalyzeCoordinator,
  createDeploymentCoordinator,
  createInitializationCoordinator,
  createScaffoldCoordinator,
} from '../agents/agent-factory';
import {
  AgentWorkflowContext,
  DeploymentRequest,
} from '../core/agent-ecosystem.types';

@Injectable()
export class AgentEcosystemService {
  constructor(private readonly config: AgentEcosystemConfig) {}

  async execute(request: string): Promise<AutonomousArchitecturePlan> {
    return this.generatePlan(request);
  }

  async deploy({
    request,
    workspaceName,
  }: DeploymentRequest): Promise<AutonomousDeploymentResult> {
    const settings = this.config.getSettings();
    const context: AgentWorkflowContext = {
      projectName: 'ocr-web-app',
      runtime: 'node',
      framework: 'nestjs',
      requestedBy: 'chief-architect',
    };
    const safeWorkspaceName = this.resolveWorkspaceName(request, workspaceName);
    const plan = await this.generatePlan(request);
    const deploymentAgent = createDeploymentCoordinator(settings.models);

    return withTrace(
      `${settings.tracingWorkflowName}-deployment`,
      async () => {
        const deployment = await this.runDeployment(
          deploymentAgent,
          this.buildDeploymentPrompt(plan, safeWorkspaceName, settings.deploymentRoot),
          context,
        );

        return AutonomousDeploymentResultSchema.parse({
          plan,
          deployment,
        });
      },
      { name: `${settings.tracingWorkflowName}-deployment` },
    );
  }

  private async generatePlan(
    request: string,
  ): Promise<AutonomousArchitecturePlan> {
    const settings = this.config.getSettings();
    const context: AgentWorkflowContext = {
      projectName: 'ocr-web-app',
      runtime: 'node',
      framework: 'nestjs',
      requestedBy: 'chief-architect',
    };

    const analysisAgent = createAnalyzeCoordinator(settings.models);
    const scaffoldAgent = createScaffoldCoordinator(settings.models);
    const initializationAgent = createInitializationCoordinator(settings.models);

    return withTrace(
      settings.tracingWorkflowName,
      async () => {
        const analysisOutput = await this.runPhase(
          analysisAgent,
          this.buildAnalyzePrompt(request),
          context,
        );

        const scaffoldOutput = await this.runPhase(
          scaffoldAgent,
          this.buildScaffoldPrompt(request, analysisOutput),
          context,
        );

        const initializationOutput = await this.runPhase(
          initializationAgent,
          this.buildInitializationPrompt(
            request,
            analysisOutput,
            scaffoldOutput,
          ),
          context,
        );

        return AutonomousArchitecturePlanSchema.parse({
          request,
          analysis: analysisOutput,
          scaffold: scaffoldOutput,
          initialization: initializationOutput,
          tracing: {
            enabled: true,
            workflowName: settings.tracingWorkflowName,
          },
        });
      },
      { name: settings.tracingWorkflowName },
    );
  }

  private async runPhase(
    agent: Agent<any, any>,
    prompt: string,
    context: AgentWorkflowContext,
  ): Promise<PhaseOutput> {
    const result = await run(agent, prompt, { context });
    return result.finalOutput as PhaseOutput;
  }

  private async runDeployment(
    agent: Agent<any, any>,
    prompt: string,
    context: AgentWorkflowContext,
  ): Promise<DeploymentReport> {
    const result = await run(agent, prompt, { context });
    return result.finalOutput as DeploymentReport;
  }

  private buildAnalyzePrompt(request: string): string {
    return [
      'Stage: analyze.',
      'Task: inspect the request and produce the dependency tree for an autonomous agent ecosystem.',
      'Constraints:',
      '- use OpenAI Agents SDK concepts',
      '- plan for NestJS integration',
      '- include handoff relationships and output guardrails',
      `User request: ${request}`,
    ].join('\n');
  }

  private buildScaffoldPrompt(request: string, analysis: PhaseOutput): string {
    return [
      'Stage: scaffold.',
      'Task: create the filesystem scaffold for the autonomous agent ecosystem.',
      'Constraints:',
      '- include /core, /agents, /tools',
      '- align to backend/src/agentic',
      '- preserve the dependency order from the analysis phase',
      `User request: ${request}`,
      `Analysis phase output: ${JSON.stringify(analysis)}`,
    ].join('\n');
  }

  private buildInitializationPrompt(
    request: string,
    analysis: PhaseOutput,
    scaffold: PhaseOutput,
  ): string {
    return [
      'Stage: initialize.',
      'Task: define the initialization and deployment wiring for the agent ecosystem.',
      'Constraints:',
      '- simple tasks should use gpt-5-mini or gpt-5-nano',
      '- decision-heavy planning should use gpt-5 with reasoning.effort=high',
      '- built-in tracing must stay enabled and be wrapped with withTrace',
      '- include agent instructions, handoff targets, and guardrail mapping',
      `User request: ${request}`,
      `Analysis phase output: ${JSON.stringify(analysis)}`,
      `Scaffold phase output: ${JSON.stringify(scaffold)}`,
    ].join('\n');
  }

  private buildDeploymentPrompt(
    plan: AutonomousArchitecturePlan,
    workspaceName: string,
    deploymentRoot: string,
  ): string {
    const scaffoldPaths = plan.scaffold.scaffold.map((item) => item.path);

    return [
      'Stage: deploy.',
      'Task: materialize the generated autonomous agent ecosystem on disk.',
      'Rules:',
      '- you must use the deployment tools',
      '- create the workspace scaffold first',
      '- write the runtime bundle next',
      '- summarize the generated bundle last',
      `Deployment root: ${deploymentRoot}`,
      `Workspace name: ${workspaceName}`,
      `Scaffold paths: ${JSON.stringify(scaffoldPaths)}`,
      `Architecture plan: ${JSON.stringify(plan)}`,
    ].join('\n');
  }

  private resolveWorkspaceName(request: string, workspaceName?: string): string {
    if (workspaceName && workspaceName.trim()) {
      return workspaceName.trim().replace(/[^a-zA-Z0-9-_]/g, '-');
    }

    const slug = request
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    return `${slug || 'agent-ecosystem'}-${Date.now()}`;
  }
}
