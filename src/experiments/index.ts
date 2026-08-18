import type { ExperimentDefinition, MetricsResult, TrialPlan, TrialRecord } from "../types";
import { seededRandom, shuffle } from "../core/hash";

const commonLimitations = ["浏览器反应时受设备、浏览器和输入延迟影响，不用于跨设备排名或诊断。", "结果仅描述本次任务表现。"];

export const METRICS_VERSION = "1.0.0";
export const ANALYSIS_RULES_VERSION = "1.0.0";

/** 试次节奏默认值（毫秒）。注视期与间隔由种子决定；响应窗可被 config.responseWindowMs 覆写。 */
const DEFAULT_RESPONSE_WINDOW_MS = 2500;
const DEFAULT_NO_RESPONSE_WINDOW_MS = 1000;
const FIXATION_RANGES: Record<string, [number, number]> = { "simple-rt": [800, 3000], default: [400, 1000] };
const ITI_RANGE: [number, number] = [300, 700];

const responseWindowSchema = { type: "integer", minimum: 500, maximum: 6000, description: "可选：覆写响应窗时长（毫秒）。No-Go 等无需响应的试次取该值与 1000 的较小值。" };

export const simpleRt: ExperimentDefinition = {
  format: "psylab-experiment-definition", formatVersion: "1.1", experimentId: "simple-rt", definitionVersion: "1.1.0",
  metadata: { title: "Simple RT 简单反应时", language: "zh-CN", purpose: "观察看到目标后作出按键反应时的试次波动。", theoryBackground: "简单反应时范式把刺激出现与按键响应之间的时间作为行为指标，可用于讨论反应准备、注意和设备输入延迟。", design: "被试内单一目标条件；每个试次在随机注视期后呈现圆形目标，注视期按键立即记为提前反应。", independentVariables: ["目标出现前的程序化等待时距"], dependentVariables: ["正确试次中位数反应时", "反应时四分位距"], durationMinutes: { min: 3, max: 8 }, riskLevel: "low", status: "beta", courses: ["实验心理学", "认知心理学"], limitations: commonLimitations, publicMetric: { id: "median_rt_ms", label: "通常反应时", description: "你在正确正式 trial 中通常需要多长时间作出反应。", interpretation: "数值越小表示本次任务中作答更快；它受设备、浏览器和输入延迟影响，不是能力评分。" } },
  configSchema: { type: "object", additionalProperties: false, properties: { practiceTrials: { type: "integer", minimum: 2, maximum: 12 }, testTrials: { type: "integer", minimum: 8, maximum: 80 }, responseWindowMs: responseWindowSchema }, required: ["practiceTrials", "testTrials"] },
  stimuli: { mode: "procedural", licenseFile: "LICENSES.md", sourceNotes: "圆形目标由 CSS 程序化绘制。" },
  runPolicy: { tier: "open", version: "1.0.0", publicCatalog: true, requiresTeacherAcknowledgement: false, requiresDebrief: false },
  metrics: [{ id: "median_rt_ms", label: "正确试次中位数反应时", unit: "ms", description: "正式阶段有响应试次的中位数反应时。", kind: "descriptive" }, { id: "rt_iqr_ms", label: "反应时四分位距", unit: "ms", description: "正式阶段反应时离散程度。", kind: "descriptive" }],
  license: { code: "Apache-2.0", content: "CC0-1.0", sourceFile: "LICENSES.md" }
};

export const stroop: ExperimentDefinition = {
  format: "psylab-experiment-definition", formatVersion: "1.1", experimentId: "stroop-color-word", definitionVersion: "1.1.0",
  metadata: { title: "颜色词 Stroop", language: "zh-CN", purpose: "观察文字语义与字体颜色一致或冲突时的反应差异。", theoryBackground: "Stroop 效应说明自动化的词义加工可能干扰按字体颜色作答的控制过程。", design: "被试内比较一致与不一致条件；条件与目标颜色的交叉单元格平衡后随机呈现，词义始终不是作答依据。", independentVariables: ["词义与字体颜色的一致性"], dependentVariables: ["一致/不一致条件反应时差", "总体正确率"], durationMinutes: { min: 5, max: 12 }, riskLevel: "low", status: "beta", courses: ["实验心理学", "认知心理学"], limitations: commonLimitations, publicMetric: { id: "stroop_interference_ms", label: "颜色冲突影响", description: "比较颜色词一致与不一致时的反应时间差异。", interpretation: "正值表示冲突条件通常更慢；它描述本次任务中的条件差异，不代表稳定的个人特征。" } },
  configSchema: { type: "object", additionalProperties: false, properties: { practiceTrials: { type: "integer", minimum: 4, maximum: 16 }, testTrials: { type: "integer", minimum: 16, maximum: 120 }, responseWindowMs: responseWindowSchema }, required: ["practiceTrials", "testTrials"] },
  stimuli: { mode: "procedural", licenseFile: "LICENSES.md", sourceNotes: "中文颜色词与 CSS 颜色均为程序化生成。" },
  runPolicy: { tier: "open", version: "1.0.0", publicCatalog: true, requiresTeacherAcknowledgement: false, requiresDebrief: false },
  metrics: [{ id: "stroop_interference_ms", label: "Stroop 冲突效应", unit: "ms", description: "不一致条件与一致条件正确试次中位数反应时之差。", kind: "within_subject_difference" }, { id: "accuracy", label: "总体正确率", unit: "%", description: "正式阶段正确响应比例。", kind: "descriptive" }],
  license: { code: "Apache-2.0", content: "CC0-1.0", sourceFile: "LICENSES.md" }
};

export const goNoGo: ExperimentDefinition = {
  format: "psylab-experiment-definition", formatVersion: "1.1", experimentId: "go-no-go", definitionVersion: "1.1.0",
  metadata: { title: "Go/No-Go 响应抑制", language: "zh-CN", purpose: "比较对 Go 刺激作出反应与对 No-Go 刺激保持不反应的表现。", theoryBackground: "Go/No-Go 范式要求在共同的反应规则中抑制对 No-Go 刺激的按键响应，可用于教学中讨论反应选择与抑制控制。", design: "被试内比较 Go 与 No-Go 目标；Go 要按空格，No-Go 要保持不按键，注视期按键立即记为提前反应。", independentVariables: ["目标类型（Go/No-Go）"], dependentVariables: ["Go 命中率", "No-Go 虚报率"], durationMinutes: { min: 5, max: 12 }, riskLevel: "low", status: "beta", courses: ["实验心理学", "认知心理学"], limitations: [...commonLimitations, "漏答和虚报只用于描述任务质量，不解释为冲动性或临床特征。"], publicMetric: { id: "no_go_false_alarm", label: "抑制准确度", description: "你在不应按键的 No-Go 试次中保持不按键的比例。", interpretation: "数值越高表示本次任务中更少出现误按；它只描述任务表现，不代表冲动性或临床特征。", transform: "invert100" } },
  configSchema: { type: "object", additionalProperties: false, properties: { practiceTrials: { type: "integer", minimum: 4, maximum: 16 }, testTrials: { type: "integer", minimum: 20, maximum: 120 }, goRatio: { type: "number", minimum: 0.4, maximum: 0.8 }, responseWindowMs: responseWindowSchema }, required: ["practiceTrials", "testTrials", "goRatio"] },
  stimuli: { mode: "procedural", licenseFile: "LICENSES.md", sourceNotes: "圆形和方形目标由 CSS 程序化绘制。" },
  runPolicy: { tier: "open", version: "1.0.0", publicCatalog: true, requiresTeacherAcknowledgement: false, requiresDebrief: false },
  metrics: [{ id: "go_accuracy", label: "Go 命中率", unit: "%", description: "Go 刺激中正确按键的比例。", kind: "descriptive" }, { id: "no_go_false_alarm", label: "No-Go 虚报率", unit: "%", description: "No-Go 刺激中错误按键的比例。", kind: "descriptive" }],
  license: { code: "Apache-2.0", content: "CC0-1.0", sourceFile: "LICENSES.md" }
};

export const mentalRotation: ExperimentDefinition = {
  format: "psylab-experiment-definition", formatVersion: "1.1", experimentId: "mental-rotation", definitionVersion: "1.1.0",
  metadata: { title: "Mental Rotation 心理旋转", language: "zh-CN", purpose: "观察抽象图形旋转角度与同异判断反应时的关系。", theoryBackground: "心理旋转研究把抽象图形的空间变换作为认知操作来观察；角度与反应时的关系只作本次任务的描述性现象。", design: "被试内比较同形与镜像图形；两侧图形从竖直方向各旋转角度的一半，同异与角度的交叉单元格平衡后随机呈现。", independentVariables: ["图形关系（同形/镜像）", "相对旋转角度"], dependentVariables: ["角度-反应时斜率", "总体正确率"], durationMinutes: { min: 5, max: 12 }, riskLevel: "low", status: "beta", courses: ["认知心理学", "实验心理学"], limitations: [...commonLimitations, "图形使用原创程序化符号，不输出空间能力等级。"], publicMetric: { id: "accuracy", label: "判断正确率", description: "你在正式试次中判断图形是否同形的正确比例。", interpretation: "它只描述本次任务中的判断结果，不等同于空间能力等级或智力评分。" } },
  configSchema: { type: "object", additionalProperties: false, properties: { practiceTrials: { type: "integer", minimum: 4, maximum: 16 }, testTrials: { type: "integer", minimum: 16, maximum: 96 }, responseWindowMs: responseWindowSchema }, required: ["practiceTrials", "testTrials"] },
  stimuli: { mode: "procedural", licenseFile: "LICENSES.md", sourceNotes: "几何图形和旋转通过 SVG transform 程序化生成。" },
  runPolicy: { tier: "open", version: "1.0.0", publicCatalog: true, requiresTeacherAcknowledgement: false, requiresDebrief: false },
  metrics: [{ id: "rotation_slope_ms_per_degree", label: "角度-反应时斜率", unit: "ms/degree", description: "各角度条件正确试次中位数的描述性斜率。", kind: "within_subject_difference" }, { id: "accuracy", label: "总体正确率", unit: "%", description: "正式阶段正确响应比例。", kind: "descriptive" }],
  license: { code: "Apache-2.0", content: "CC0-1.0", sourceFile: "LICENSES.md" }
};

export const definitions = [simpleRt, stroop, goNoGo, mentalRotation];
export const definitionMap = Object.fromEntries(definitions.map((definition) => [definition.experimentId, definition]));

export function defaultConfig(id: string): Record<string, unknown> {
  if (id === "simple-rt") return { practiceTrials: 3, testTrials: 12 };
  if (id === "stroop-color-word") return { practiceTrials: 4, testTrials: 24 };
  if (id === "go-no-go") return { practiceTrials: 4, testTrials: 24, goRatio: 0.7 };
  return { practiceTrials: 4, testTrials: 24 };
}

function seededRange(seed: string, [min, max]: [number, number]): number {
  return min + Math.round(seededRandom(seed)() * (max - min));
}

/** 注视期、试次间隔与响应窗都进入 plan.data，随结果包导出并可由导入器重建。 */
function pacingData(experimentId: string, seedKey: string, config: Record<string, unknown>, noResponseExpected: boolean): Record<string, unknown> {
  const configured = Number(config.responseWindowMs);
  const windowMs = Number.isInteger(configured) && configured >= 500 && configured <= 6000
    ? configured
    : noResponseExpected ? DEFAULT_NO_RESPONSE_WINDOW_MS : DEFAULT_RESPONSE_WINDOW_MS;
  return {
    fixationMs: seededRange(seedKey, FIXATION_RANGES[experimentId] ?? FIXATION_RANGES.default),
    itiMs: seededRange(`${seedKey}:iti`, ITI_RANGE),
    responseWindowMs: noResponseExpected ? Math.min(windowMs, DEFAULT_NO_RESPONSE_WINDOW_MS) : windowMs
  };
}

const STROOP_COLORS = [
  { word: "红", color: "#d94841", key: "f", name: "red" },
  { word: "绿", color: "#2f9e44", key: "j", name: "green" },
  { word: "蓝", color: "#1971c2", key: "k", name: "blue" }
] as const;

/** 条件 × 目标颜色的均衡单元格；余数按固定轮转分配，保证各单元格计数差 ≤ 1。 */
function stroopCells(count: number): Array<{ condition: "congruent" | "incongruent"; colorIndex: number }> {
  const cells: Array<{ condition: "congruent" | "incongruent"; colorIndex: number }> = [];
  const perCell = Math.floor(count / 6);
  for (const condition of ["congruent", "incongruent"] as const)
    for (let colorIndex = 0; colorIndex < STROOP_COLORS.length; colorIndex += 1)
      for (let repeat = 0; repeat < perCell; repeat += 1) cells.push({ condition, colorIndex });
  for (let remainder = count - cells.length, cursor = 0; remainder > 0; remainder -= 1, cursor += 1)
    cells.push({ condition: cursor % 2 === 0 ? "congruent" : "incongruent", colorIndex: Math.floor(cursor / 2) % STROOP_COLORS.length });
  return cells;
}

function stroopPlans(phase: "practice" | "test", count: number, config: Record<string, unknown>, seedKey: string): TrialPlan[] {
  return shuffle(stroopCells(count), `${seedKey}-shuffle`).map((cell, index) => {
    const target = STROOP_COLORS[cell.colorIndex];
    // 不一致条件下的干扰词在另外两种颜色间交替，避免干扰词颜色与条件产生系统关联。
    const distractor = STROOP_COLORS[(cell.colorIndex + (index % 2 === 0 ? 1 : 2)) % STROOP_COLORS.length];
    const word = cell.condition === "congruent" ? target : distractor;
    return { phase, condition: cell.condition, stimulusId: `stroop-${phase === "practice" ? "p" : "t"}-${index}`, correctResponse: target.key, stimulus: word.word, data: { color: target.color, colorName: target.name, word: word.name, responseKey: target.key, congruent: cell.condition === "congruent", ...pacingData("stroop-color-word", `${seedKey}-${index}`, config, false) } };
  });
}

function goNoGoPlans(phase: "practice" | "test", count: number, config: Record<string, unknown>, seedKey: string): TrialPlan[] {
  const ratio = Number(config.goRatio ?? 0.7);
  const targets = Array.from({ length: count }, (_, index) => (index / count < ratio ? "go" : "no-go") as "go" | "no-go");
  return shuffle(targets, `${seedKey}-shuffle`).map((targetType, index) => ({ phase, condition: targetType, stimulusId: `gng-${phase === "practice" ? "p" : "t"}-${index}`, correctResponse: targetType === "go" ? " " : null, stimulus: targetType === "go" ? "●" : "■", data: { targetType, anticipationSensitive: true, ...pacingData("go-no-go", `${seedKey}-${index}`, config, targetType === "no-go") } }));
}

const ROTATION_ANGLES = [0, 45, 90, 135];

/** 同异 × 角度的均衡单元格；余数按固定轮转分配，保证各单元格计数差 ≤ 1。 */
function rotationCells(count: number): Array<{ same: boolean; angle: number }> {
  const cells: Array<{ same: boolean; angle: number }> = [];
  const perCell = Math.floor(count / 8);
  for (const same of [true, false])
    for (const angle of ROTATION_ANGLES)
      for (let repeat = 0; repeat < perCell; repeat += 1) cells.push({ same, angle });
  for (let remainder = count - cells.length, cursor = 0; remainder > 0; remainder -= 1, cursor += 1)
    cells.push({ same: cursor % 2 === 0, angle: ROTATION_ANGLES[Math.floor(cursor / 2) % ROTATION_ANGLES.length] });
  return cells;
}

function rotationPlans(phase: "practice" | "test", count: number, config: Record<string, unknown>, seedKey: string): TrialPlan[] {
  return shuffle(rotationCells(count), `${seedKey}-shuffle`).map((cell, index) => ({ phase, condition: `${cell.same ? "same" : "mirror"}-${cell.angle}`, stimulusId: `rotation-${phase === "practice" ? "p" : "t"}-${index}`, correctResponse: cell.same ? "f" : "j", stimulus: "geometry", data: { angle: cell.angle, same: cell.same, responseKey: cell.same ? "f" : "j", stimulusType: "corner-blocks", ...pacingData("mental-rotation", `${seedKey}-${index}`, config, false) } }));
}

export function generateTrials(id: string, config: Record<string, unknown>, seed: string): TrialPlan[] {
  if (id === "simple-rt") {
    const plan = (phase: "practice" | "test", index: number): TrialPlan => ({ phase, condition: "target", stimulusId: `rt-${phase === "practice" ? "p" : "t"}-${index}`, correctResponse: " ", stimulus: "●", data: { anticipationSensitive: true, ...pacingData("simple-rt", `${seed}-${phase}-${index}`, config, false) } });
    return [...Array.from({ length: Number(config.practiceTrials) }, (_, index) => plan("practice", index)), ...Array.from({ length: Number(config.testTrials) }, (_, index) => plan("test", index))];
  }
  if (id === "stroop-color-word") return [...stroopPlans("practice", Number(config.practiceTrials), config, `${seed}-p`), ...stroopPlans("test", Number(config.testTrials), config, `${seed}-t`)];
  if (id === "go-no-go") return [...goNoGoPlans("practice", Number(config.practiceTrials), config, `${seed}-p`), ...goNoGoPlans("test", Number(config.testTrials), config, `${seed}-t`)];
  return [...rotationPlans("practice", Number(config.practiceTrials), config, `${seed}-p`), ...rotationPlans("test", Number(config.testTrials), config, `${seed}-t`)];
}

function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function mean(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

type ConditionStats = MetricsResult["byCondition"];

function byCondition(rows: TrialRecord[], rtRows: TrialRecord[] = rows): ConditionStats {
  const results: ConditionStats = {};
  const conditions = [...new Set([...rows, ...rtRows].map((trial) => trial.condition))];
  for (const condition of conditions) {
    const conditionRows = rows.filter((trial) => trial.condition === condition);
    const rtConditionRows = rtRows.filter((trial) => trial.condition === condition);
    const rts = rtConditionRows.flatMap((trial) => trial.rtMs !== null && trial.correct ? [trial.rtMs] : []);
    results[condition] = { n: conditionRows.length, accuracy: conditionRows.length ? (conditionRows.filter((trial) => trial.correct === true).length / conditionRows.length) * 100 : null, medianRtMs: median(rts), meanRtMs: mean(rts) };
  }
  return results;
}

function metricValues(id: string, accuracyRows: TrialRecord[], conditions: ConditionStats, rtRows: TrialRecord[]): Record<string, number | null> {
  const correctRts = rtRows.flatMap((trial) => trial.rtMs !== null && trial.correct ? [trial.rtMs] : []);
  const accuracy = accuracyRows.length ? (accuracyRows.filter((trial) => trial.correct === true).length / accuracyRows.length) * 100 : null;
  if (id === "simple-rt") {
    const sorted = [...correctRts].sort((a, b) => a - b);
    return { median_rt_ms: median(correctRts), rt_iqr_ms: sorted.length > 3 ? sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)] : null };
  }
  if (id === "stroop-color-word") {
    const congruent = conditions.congruent?.medianRtMs;
    const incongruent = conditions.incongruent?.medianRtMs;
    return { stroop_interference_ms: congruent !== null && congruent !== undefined && incongruent !== null && incongruent !== undefined ? incongruent - congruent : null, accuracy };
  }
  if (id === "go-no-go") {
    const noGoAccuracy = conditions["no-go"]?.accuracy;
    return { go_accuracy: conditions.go?.accuracy ?? null, no_go_false_alarm: noGoAccuracy === null || noGoAccuracy === undefined ? null : 100 - noGoAccuracy };
  }
  const points = Object.entries(conditions).map(([condition, result]) => ({ x: Number(condition.split("-").at(-1)), y: result.medianRtMs })).filter((point): point is { x: number; y: number } => point.y !== null);
  const meanX = mean(points.map((point) => point.x)) ?? 0;
  const meanY = mean(points.map((point) => point.y)) ?? 0;
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  return { rotation_slope_ms_per_degree: denominator ? points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator : null, accuracy };
}

export function calculateMetrics(id: string, trials: TrialRecord[]): MetricsResult {
  const testTrials = trials.filter((trial) => trial.phase === "test");
  const validForRt = testTrials.filter((trial) => !trial.excluded);
  const rawConditions = byCondition(testTrials, testTrials);
  const cleanedConditions = byCondition(testTrials, validForRt);
  const excluded = trials.filter((trial) => trial.excluded).map((trial) => ({ trialIndex: trial.trialIndex, reasons: trial.exclusionReasons }));
  const qualityFlags: string[] = [];
  if (!validForRt.length) qualityFlags.push("no-valid-test-trials");
  if (trials.some((trial) => trial.focusLostBeforeResponse)) qualityFlags.push("focus-loss");
  if (testTrials.length && (testTrials.filter((trial) => trial.correct === true).length / testTrials.length) < 0.5) qualityFlags.push("low-accuracy");
  return { metricsVersion: METRICS_VERSION, analysisRulesVersion: ANALYSIS_RULES_VERSION, raw: metricValues(id, testTrials, rawConditions, testTrials), cleaned: metricValues(id, testTrials, cleanedConditions, validForRt), byCondition: cleanedConditions, excluded, qualityFlags };
}
