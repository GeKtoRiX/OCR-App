export const AGENTIC_PATTERNS = {
  ARCHITECTURE: 'agentic.architecture',
  DEPLOY: 'agentic.deploy',
} as const;

export interface AgenticArchitecturePayload {
  request: string;
}

export interface AgenticDependencyNodeDto {
  id: string;
  description: string;
  dependsOn: string[];
}

export interface AgenticScaffoldItemDto {
  path: string;
  purpose: string;
}

export interface AgenticBlueprintDto {
  name: string;
  role: string;
  instructionsSummary: string;
  model: string;
  reasoningEffort: string;
  handoffTargets: string[];
  guardrails: string[];
}

export interface AgenticPhaseOutputDto {
  stage: 'analyze' | 'scaffold' | 'initialize';
  summary: string;
  dependencyTree: AgenticDependencyNodeDto[];
  scaffold: AgenticScaffoldItemDto[];
  agentBlueprints: AgenticBlueprintDto[];
  decisions: string[];
}

export interface AgenticArchitectureResponse {
  request: string;
  analysis: AgenticPhaseOutputDto & { stage: 'analyze' };
  scaffold: AgenticPhaseOutputDto & { stage: 'scaffold' };
  initialization: AgenticPhaseOutputDto & { stage: 'initialize' };
  tracing: {
    enabled: true;
    workflowName: string;
  };
}

export interface AgenticDeployPayload {
  request: string;
  workspaceName?: string;
}

export interface AgenticDeploymentArtifactDto {
  path: string;
  kind: 'directory' | 'file';
  status: 'created' | 'updated';
}

export interface AgenticDeploymentReportDto {
  workspaceName: string;
  rootDir: string;
  summary: string;
  artifacts: AgenticDeploymentArtifactDto[];
  generatedFiles: string[];
}

export interface AgenticDeployResponse {
  plan: AgenticArchitectureResponse;
  deployment: AgenticDeploymentReportDto;
}
