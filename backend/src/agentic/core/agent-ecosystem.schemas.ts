import { z } from 'zod';

export const WorkflowStageSchema = z.enum([
  'analyze',
  'scaffold',
  'initialize',
]);

export const DependencyNodeSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
});

export const ScaffoldItemSchema = z.object({
  path: z.string().min(1),
  purpose: z.string().min(1),
});

export const AgentBlueprintSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  instructionsSummary: z.string().min(1),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
  handoffTargets: z.array(z.string()).default([]),
  guardrails: z.array(z.string()).default([]),
});

export const PhaseOutputSchema = z.object({
  stage: WorkflowStageSchema,
  summary: z.string().min(1),
  dependencyTree: z.array(DependencyNodeSchema).default([]),
  scaffold: z.array(ScaffoldItemSchema).default([]),
  agentBlueprints: z.array(AgentBlueprintSchema).default([]),
  decisions: z.array(z.string()).default([]),
});

export const AutonomousArchitecturePlanSchema = z.object({
  request: z.string().min(1),
  analysis: PhaseOutputSchema.extend({ stage: z.literal('analyze') }),
  scaffold: PhaseOutputSchema.extend({ stage: z.literal('scaffold') }),
  initialization: PhaseOutputSchema.extend({ stage: z.literal('initialize') }),
  tracing: z.object({
    enabled: z.literal(true),
    workflowName: z.string().min(1),
  }),
});

export const DeploymentArtifactSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['directory', 'file']),
  status: z.enum(['created', 'updated']),
});

export const DeploymentReportSchema = z.object({
  workspaceName: z.string().min(1),
  rootDir: z.string().min(1),
  summary: z.string().min(1),
  artifacts: z.array(DeploymentArtifactSchema).min(1),
  generatedFiles: z.array(z.string().min(1)).min(1),
});

export const AutonomousDeploymentResultSchema = z.object({
  plan: AutonomousArchitecturePlanSchema,
  deployment: DeploymentReportSchema,
});

export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;
export type DependencyNode = z.infer<typeof DependencyNodeSchema>;
export type ScaffoldItem = z.infer<typeof ScaffoldItemSchema>;
export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;
export type PhaseOutput = z.infer<typeof PhaseOutputSchema>;
export type AutonomousArchitecturePlan = z.infer<
  typeof AutonomousArchitecturePlanSchema
>;
export type DeploymentArtifact = z.infer<typeof DeploymentArtifactSchema>;
export type DeploymentReport = z.infer<typeof DeploymentReportSchema>;
export type AutonomousDeploymentResult = z.infer<
  typeof AutonomousDeploymentResultSchema
>;
