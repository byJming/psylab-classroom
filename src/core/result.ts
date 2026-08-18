import { calculateMetrics } from "../experiments";
import type { ExperimentDefinition, ResultBundle, SessionManifest, TrialRecord } from "../types";
import { experimentConfig } from "../runtime/policy";

export interface ResultEnvironment {
  browserFamily: ResultBundle["environment"]["browserFamily"];
  platformFamily: ResultBundle["environment"]["platformFamily"];
  viewportBucket: ResultBundle["environment"]["viewportBucket"];
  inputMode: ResultBundle["environment"]["inputMode"];
}

export interface ResultBundleInput {
  definition: ExperimentDefinition;
  manifest: SessionManifest;
  participantCode: string;
  attemptId: string;
  randomSeed: string;
  environment: ResultEnvironment;
  focusLossCount: number;
  fullscreenExitCount: number;
  storageRecoveryUsed: boolean;
  trials: TrialRecord[];
  completed: boolean;
  exportedAt: string;
}

/** Builds the same versioned bundle for completed and interrupted runs. */
export function buildResultBundle(input: ResultBundleInput): ResultBundle {
  const metrics = calculateMetrics(input.manifest.experimentId, input.trials);
  const flags = [...metrics.qualityFlags];
  if (!input.completed) flags.push("interrupted");
  const qualityFlags = [...new Set(flags)];
  return {
    format: "psylab-result",
    formatVersion: "1.1",
    experiment: {
      experimentId: input.manifest.experimentId,
      definitionVersion: input.manifest.definitionVersion,
      metricsVersion: metrics.metricsVersion,
      analysisRulesVersion: metrics.analysisRulesVersion,
      distributionTier: input.manifest.distributionTier,
      runPolicyVersion: input.manifest.runPolicyVersion,
      configHash: input.manifest.configHash,
      config: experimentConfig(input.manifest.config)
    },
    session: {
      sessionId: input.manifest.sessionId,
      participantCode: input.participantCode,
      attemptId: input.attemptId,
      randomSeed: input.randomSeed
    },
    environment: input.environment,
    quality: {
      completed: input.completed,
      focusLossCount: input.focusLossCount,
      fullscreenExitCount: input.fullscreenExitCount,
      storageRecoveryUsed: input.storageRecoveryUsed,
      flags: qualityFlags
    },
    trials: input.trials,
    summary: {
      raw: metrics.raw,
      cleaned: metrics.cleaned,
      byCondition: metrics.byCondition,
      excluded: metrics.excluded
    },
    exportedAt: input.exportedAt
  };
}
