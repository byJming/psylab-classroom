export type Tier = "open" | "guided" | "controlled";
export type Status = "alpha" | "beta" | "stable";
export type Phase = "instruction" | "practice" | "test" | "break";
export type TrialOutcome = "correct" | "incorrect" | "no-response" | "anticipation" | "focus-loss";

export interface RunPolicy {
  tier: Tier;
  version: string;
  publicCatalog: boolean;
  requiresTeacherAcknowledgement: boolean;
  requiresDebrief: boolean;
  notes?: string[];
}

export interface ExperimentDefinition {
  format: "psylab-experiment-definition";
  formatVersion: string;
  experimentId: string;
  definitionVersion: string;
  metadata: {
    title: string;
    language: "zh-CN";
    purpose: string;
    theoryBackground: string;
    design: string;
    independentVariables: string[];
    dependentVariables: string[];
    durationMinutes: { min: number; max: number };
    riskLevel: "low" | "contextual" | "controlled";
    status: Status;
    courses?: string[];
    limitations?: string[];
    publicMetric?: {
      id: string;
      label: string;
      description: string;
      interpretation: string;
      transform?: "identity" | "invert100";
    };
  };
  configSchema: Record<string, unknown>;
  stimuli?: { mode?: "procedural" | "bundled" | "mixed"; licenseFile?: string; sourceNotes?: string };
  runPolicy: RunPolicy;
  metrics: Array<{ id: string; label: string; unit: string; description: string; kind?: string }>;
  license: { code: string; content: string; sourceFile: string };
}

export interface TrialRecord {
  trialIndex: number;
  phase: Phase;
  condition: string;
  stimulusId: string | null;
  correctResponse: string | null;
  response: string | null;
  correct: boolean | null;
  outcome?: TrialOutcome;
  rtMs: number | null;
  stimulusDurationMs: number | null;
  visibilityState: "visible" | "hidden" | "unknown";
  focusLostBeforeResponse: boolean;
  excluded: boolean;
  exclusionReasons: string[];
  data: Record<string, unknown>;
}

export interface SessionManifest {
  format: "psylab-session";
  formatVersion: string;
  experimentId: string;
  definitionVersion: string;
  distributionTier: Tier;
  runPolicyVersion: string;
  config: Record<string, unknown>;
  configHash: string;
  sessionId: string;
  createdAt: string;
}

export interface ResultBundle {
  format: "psylab-result";
  formatVersion: string;
  experiment: {
    experimentId: string;
    definitionVersion: string;
    metricsVersion: string;
    analysisRulesVersion: string;
    distributionTier: Tier;
    runPolicyVersion: string;
    configHash: string;
    config: Record<string, unknown>;
  };
  session: { sessionId: string; participantCode: string; attemptId: string; randomSeed: string };
  environment: {
    browserFamily: "Chromium" | "Firefox" | "Safari" | "Other" | "Unknown";
    platformFamily: "Windows" | "macOS" | "Linux" | "Android" | "iOS" | "Other" | "Unknown";
    viewportBucket: "small" | "medium" | "large" | "unknown";
    inputMode: "keyboard" | "pointer" | "touch" | "unknown";
  };
  quality: {
    completed: boolean;
    focusLossCount: number;
    fullscreenExitCount: number;
    storageRecoveryUsed: boolean;
    flags?: string[];
  };
  trials: TrialRecord[];
  summary: Record<string, unknown>;
  exportedAt: string;
}

export interface TrialPlan {
  phase: Exclude<Phase, "instruction" | "break">;
  condition: string;
  stimulusId: string;
  correctResponse: string | null;
  stimulus: string;
  data: Record<string, unknown>;
}

export interface MetricsResult {
  metricsVersion: string;
  analysisRulesVersion: string;
  raw: Record<string, number | null>;
  cleaned: Record<string, number | null>;
  byCondition: Record<string, { n: number; accuracy: number | null; medianRtMs: number | null; meanRtMs: number | null }>;
  excluded: Array<{ trialIndex: number; reasons: string[] }>;
  qualityFlags: string[];
}

export interface PreflightResult {
  ok: boolean;
  canStart: boolean;
  checks: Array<{ id: string; label: string; ok: boolean; detail: string }>;
}

export interface ImportReport {
  accepted: ResultBundle[];
  errors: Array<{ file: string; reasons: string[] }>;
  warnings: Array<{ file: string; reasons: string[] }>;
}
