import { sha256 } from "../core/hash";
import { validateConfig, validateSession } from "../core/schema";
import type { ExperimentDefinition, ResultBundle, SessionManifest } from "../types";

export function experimentConfig(config: Record<string, unknown>): Record<string, unknown> {
  const nonExperimentKeys = new Set(["participantCode", "teacherAcknowledged", "preset", "language"]);
  return Object.fromEntries(Object.entries(config).filter(([key]) => !nonExperimentKeys.has(key)));
}

/** A guided result is not interpretable or importable until its debrief is recorded. */
export function hasCompletedRequiredDebrief(bundle: ResultBundle, definition?: ExperimentDefinition): boolean {
  return !definition?.runPolicy.requiresDebrief || Boolean(bundle.quality.flags?.includes("debrief-completed"));
}

/** Validates the public-runner policy before any trial is presented. */
export async function validateRunManifest(manifest: SessionManifest, definition?: ExperimentDefinition): Promise<string[]> {
  if (!definition) return ["找不到会话指定的实验定义"];
  const config = experimentConfig(manifest.config);
  const sessionCheck = validateSession(manifest);
  const configCheck = validateConfig(definition, config);
  const errors: string[] = [];
  if (!sessionCheck.valid) errors.push(`会话格式无效：${sessionCheck.errors.join("；")}`);
  if (!configCheck.valid) errors.push(`实验配置无效：${configCheck.errors.join("；")}`);
  if (await sha256(config) !== manifest.configHash) errors.push("配置哈希不匹配：会话文件可能已被修改");
  if (manifest.experimentId !== definition.experimentId) errors.push("会话实验 ID 与当前 Definition 不一致");
  if (manifest.definitionVersion !== definition.definitionVersion) errors.push("会话 Definition 版本与当前版本不一致");
  if (manifest.distributionTier !== definition.runPolicy.tier || manifest.runPolicyVersion !== definition.runPolicy.version) errors.push("发布策略与实验定义不一致");
  if (definition.runPolicy.requiresTeacherAcknowledgement && manifest.config.teacherAcknowledged !== true) errors.push("引导层会话缺少教师确认记录");
  if (definition.runPolicy.tier === "controlled") errors.push("受控层实验不在公共静态站点运行，请按本地伦理与部署流程处理。");
  return errors;
}
