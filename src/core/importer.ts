import type { ExperimentDefinition, ImportReport, ResultBundle } from "../types";
import { validateConfig, validateResult } from "./schema";
import { ANALYSIS_RULES_VERSION, definitionMap, generateTrials, METRICS_VERSION } from "../experiments";
import { sha256 } from "./hash";
import { hasCompletedRequiredDebrief } from "../runtime/policy";

export async function readJsonFile(file: File): Promise<unknown> { return JSON.parse(await file.text()); }

async function trialStructureErrors(bundle: ResultBundle, definition: ExperimentDefinition): Promise<string[]> {
  const reasons: string[] = [];
  const config = bundle.experiment.config;
  const configCheck = validateConfig(definition, config);
  if (!configCheck.valid) reasons.push(`结果配置不符合当前 Definition：${configCheck.errors.join("；")}`);
  if (await sha256(config) !== bundle.experiment.configHash) reasons.push("结果配置快照与 configHash 不一致");
  reasons.push(...consistencyErrors(bundle));
  if (reasons.length) return reasons;

  const expected = generateTrials(definition.experimentId, config, bundle.session.randomSeed);
  const indices = bundle.trials.map((trial) => trial.trialIndex);
  if (new Set(indices).size !== indices.length) reasons.push("结果包含重复 trialIndex");
  if (indices.some((index) => index < 0 || index >= expected.length)) reasons.push("结果包含超出计划范围的 trialIndex");
  if (!bundle.quality.completed) return reasons;
  if (bundle.trials.length !== expected.length) reasons.push("完整结果的 trial 数量与配置不一致");
  const actualByIndex = new Map(bundle.trials.map((trial) => [trial.trialIndex, trial]));
  for (const [index, plan] of expected.entries()) {
    const actual = actualByIndex.get(index);
    if (!actual || actual.phase !== plan.phase || actual.condition !== plan.condition || actual.stimulusId !== plan.stimulusId || actual.correctResponse !== plan.correctResponse) {
      reasons.push("完整结果的 trial 阶段、条件或刺激结构与固定随机计划不一致");
      break;
    }
    // 程序化字段（节奏、条件标签等）由种子决定，逐一与重建计划比对，阻止就地篡改 data。
    if (Object.entries(plan.data).some(([key, value]) => !Object.is(actual.data[key], value))) {
      reasons.push("完整结果的试次程序化字段（节奏/条件）与固定随机计划不一致");
      break;
    }
  }
  return reasons;
}

/** rtMs 允许略超过响应窗，覆盖浏览器计时与渲染延迟。 */
const RT_TOLERANCE_MS = 100;

/**
 * 逐试次重算派生字段（correct/outcome/排除标记/反应时界限），与运行时（JsPsychStage）的构造公式一致。
 * 学生用文本编辑器改 correct、删除排除标记或改出超界反应时都会在这里被拦下。
 * 注：反应时数值本身无法在本地验证真伪（见 docs/data-contract.md 的防篡改边界）。
 */
function consistencyErrors(bundle: ResultBundle): string[] {
  const reasons: string[] = [];
  for (const trial of bundle.trials) {
    const label = `trial ${trial.trialIndex}`;
    const windowMs = Number(trial.data.responseWindowMs ?? (trial.correctResponse === null ? 1000 : 2500));
    // 旧导出可能没有 responseDuringWindow；回退到顶层 response 字段。
    const actualResponse = trial.data.responseDuringWindow !== undefined
      ? (typeof trial.data.responseDuringWindow === "string" ? trial.data.responseDuringWindow : null)
      : trial.response;
    const anticipationResponse = typeof trial.data.anticipationResponse === "string" ? trial.data.anticipationResponse : null;
    const noResponseExpected = trial.correctResponse === null;
    const correct = !anticipationResponse && (noResponseExpected ? actualResponse === null : actualResponse === trial.correctResponse);
    const anticipation = anticipationResponse !== null;
    const noResponseError = actualResponse === null && !noResponseExpected;
    if (trial.correct !== correct) { reasons.push(`${label} 的 correct 标记与实际响应不一致`); continue; }
    if (trial.excluded !== (noResponseError || !correct || trial.focusLostBeforeResponse || anticipation)) { reasons.push(`${label} 的排除标记与清洗规则不一致`); continue; }
    const incorrectResponse = !anticipation && !noResponseError && !correct;
    const expectedReasons = [...(noResponseError ? ["no-response"] : []), ...(incorrectResponse ? ["incorrect"] : []), ...(trial.focusLostBeforeResponse ? ["focus-loss"] : []), ...(anticipation ? ["anticipation"] : [])];
    if (trial.exclusionReasons.join("|") !== expectedReasons.join("|")) { reasons.push(`${label} 的排除原因与清洗规则不一致`); continue; }
    if (trial.outcome !== undefined) {
      const outcome = trial.focusLostBeforeResponse ? "focus-loss" : anticipation ? "anticipation" : noResponseError ? "no-response" : correct ? "correct" : "incorrect";
      if (trial.outcome !== outcome) { reasons.push(`${label} 的 outcome 与响应记录不一致`); continue; }
    }
    if (trial.rtMs !== null) {
      // 敏感实验提前按键后的反馈窗不可响应；非敏感实验的提前键仍在响应窗内计时。
      const limit = anticipation ? windowMs : windowMs + RT_TOLERANCE_MS;
      if (trial.rtMs < 0 || trial.rtMs > limit) { reasons.push(`${label} 的反应时超出该试次响应窗（${trial.rtMs}ms > ${limit}ms）`); continue; }
    } else if (actualResponse !== null && !anticipation) { reasons.push(`${label} 有按键响应但缺少反应时`); continue; }
    const anticipationRtMs = trial.data.anticipationRtMs;
    if (typeof anticipationRtMs === "number" && (anticipationRtMs < 0 || anticipationRtMs > Number(trial.data.fixationMs ?? 0) + RT_TOLERANCE_MS)) { reasons.push(`${label} 的提前反应时间超出注视期`); continue; }
  }
  return reasons;
}

export async function importResultFiles(files: File[], expected?: { experimentId?: string; definitionVersion?: string; runPolicyVersion?: string; configHash?: string; distributionTier?: string }): Promise<ImportReport> {
  const accepted: ResultBundle[] = []; const acceptedFiles: string[] = []; const errors: ImportReport["errors"] = []; const warnings: ImportReport["warnings"] = [];
  for (const file of files) {
    try {
      if (file.size > 5 * 1024 * 1024) { errors.push({ file: file.name, reasons: ["文件超过 5 MB 限制"] }); continue; }
      const value = await readJsonFile(file); const validation = validateResult(value);
      if (!validation.valid || !validation.value) { errors.push({ file: file.name, reasons: validation.errors }); continue; }
      const bundle = validation.value;
      const reasons: string[] = [];
      const definition = definitionMap[bundle.experiment.experimentId];
      if (!definition) reasons.push("找不到对应的实验 Definition");
      else {
        if (bundle.experiment.definitionVersion !== definition.definitionVersion) reasons.push("结果 Definition 版本（definitionVersion）不是当前版本");
        if (bundle.experiment.runPolicyVersion !== definition.runPolicy.version) reasons.push("结果发布策略版本不是当前版本");
        if (bundle.experiment.distributionTier !== definition.runPolicy.tier) reasons.push("结果发布层级与当前 Definition 不一致");
        if (bundle.experiment.metricsVersion !== METRICS_VERSION) reasons.push("结果 Metrics 版本（metricsVersion）不是当前版本");
        if (bundle.experiment.analysisRulesVersion !== ANALYSIS_RULES_VERSION) reasons.push("结果分析规则版本（analysisRulesVersion）不是当前版本");
        if (!hasCompletedRequiredDebrief(bundle, definition)) reasons.push("guided 结果缺少 debrief-completed 记录");
        reasons.push(...await trialStructureErrors(bundle, definition));
      }
      if (expected?.experimentId && bundle.experiment.experimentId !== expected.experimentId) reasons.push("实验 ID 与本批次不一致");
      if (expected?.definitionVersion && bundle.experiment.definitionVersion !== expected.definitionVersion) reasons.push("实验 Definition 版本与会话不一致");
      if (expected?.runPolicyVersion && bundle.experiment.runPolicyVersion !== expected.runPolicyVersion) reasons.push("发布策略版本与会话不一致");
      if (expected?.configHash && bundle.experiment.configHash !== expected.configHash) reasons.push("配置哈希与本批次不一致");
      if (expected?.distributionTier && bundle.experiment.distributionTier !== expected.distributionTier) reasons.push("发布层级与本批次不一致");
      if (reasons.length) { errors.push({ file: file.name, reasons }); continue; }
      if (bundle.experiment.distributionTier === "guided") warnings.push({ file: file.name, reasons: ["guided 结果需要教师会话、扩展告知和 debrief 记录，须单独解释"] });
      if (bundle.experiment.distributionTier === "controlled") warnings.push({ file: file.name, reasons: ["controlled 结果必须确认本地伦理、材料审查、参与者资格和退出支持，不得与开放层结果混合"] });
      if (!bundle.quality.completed) warnings.push({ file: file.name, reasons: ["结果为中途退出，已保留但应单独处理"] });
      accepted.push(bundle); acceptedFiles.push(file.name);
    } catch (error) { errors.push({ file: file.name, reasons: [error instanceof Error ? error.message : "无法解析 JSON"] }); }
  }
  const hardDefinitionErrors = errors.some((error) => error.reasons.some((reason) => /Definition|Metrics|分析规则|发布策略版本|发布层级|配置哈希与本批次|结果配置快照与 configHash/.test(reason)));
  if (hardDefinitionErrors) return { accepted: [], errors, warnings };
  const experiments = new Set(accepted.map((bundle) => bundle.experiment.experimentId)); if (experiments.size > 1) { errors.push({ file: "batch", reasons: ["批次包含多个实验，混合实验已阻止"] }); return { accepted: [], errors, warnings }; }
  const versionFields: Array<keyof ResultBundle["experiment"]> = ["definitionVersion", "metricsVersion", "analysisRulesVersion", "configHash", "distributionTier", "runPolicyVersion"];
  const inconsistentFields = versionFields.filter((field) => new Set(accepted.map((bundle) => bundle.experiment[field])).size > 1);
  if (inconsistentFields.length) { errors.push({ file: "batch", reasons: [`批次版本或配置不一致：${inconsistentFields.join(", ")}`] }); return { accepted: [], errors, warnings }; }
  const seen = new Set<string>(); const duplicates = new Set<string>();
  for (const bundle of accepted) { const key = `${bundle.session.sessionId}:${bundle.session.participantCode}:${bundle.session.attemptId}`; if (seen.has(key)) duplicates.add(key); seen.add(key); }
  if (duplicates.size) { for (let index = accepted.length - 1; index >= 0; index -= 1) { const bundle = accepted[index]; const key = `${bundle.session.sessionId}:${bundle.session.participantCode}:${bundle.session.attemptId}`; if (duplicates.has(key)) { errors.push({ file: `attempt:${key}`, reasons: ["检测到重复提交，已从汇总中排除"] }); accepted.splice(index, 1); } } }
  // 同一参与者的多次不同尝试不是重复提交，但可能是“重跑挑最好成绩”；保留并提醒教师确认取舍。
  const attemptCounts = new Map<string, { files: string[]; attemptIds: string[] }>();
  accepted.forEach((bundle, index) => { const key = `${bundle.session.sessionId}:${bundle.session.participantCode}`; const entry = attemptCounts.get(key) ?? { files: [], attemptIds: [] }; entry.files.push(acceptedFiles[index]); entry.attemptIds.push(bundle.session.attemptId); attemptCounts.set(key, entry); });
  for (const entry of attemptCounts.values()) if (new Set(entry.attemptIds).size > 1) warnings.push({ file: entry.files.join(", "), reasons: [`同一参与者提交了 ${new Set(entry.attemptIds).size} 次不同尝试（${[...new Set(entry.attemptIds)].join("、")}），可能是重跑后挑选最好成绩，请确认采用哪一次`] });
  return { accepted, errors, warnings };
}

export function errorReportCsv(report: ImportReport): string { const rows = report.errors.map((error) => ({ file: error.file, reasons: error.reasons.join(" | ") })); const header = "\uFEFFfile,reasons\r\n"; return header + rows.map((row) => `${row.file.replaceAll(",", " ")},"${row.reasons.replaceAll('"', '""')}"`).join("\r\n"); }
