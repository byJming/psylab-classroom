import { calculateMetrics } from "../experiments";
import type { ExperimentDefinition, MetricsResult, ResultBundle } from "../types";

function csvCell(value: unknown): string { const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
export function toCsv(rows: Array<Record<string, unknown>>): string { if (!rows.length) return "\uFEFF"; const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]; return `\uFEFF${[headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`; }

export function parseCsv(input: string): Array<Record<string, string>> {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\r" || char === "\n") { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); if (row.some((value) => value.length > 0)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function trialRows(bundle: ResultBundle): Array<Record<string, unknown>> {
  return bundle.trials.map((trial) => ({ experimentId: bundle.experiment.experimentId, definitionVersion: bundle.experiment.definitionVersion, metricsVersion: bundle.experiment.metricsVersion, configHash: bundle.experiment.configHash, sessionId: bundle.session.sessionId, participantCode: bundle.session.participantCode, attemptId: bundle.session.attemptId, ...trial, data: JSON.stringify(trial.data), exclusionReasons: trial.exclusionReasons.join("|") }));
}

function summaryRow(bundle: ResultBundle, metrics: MetricsResult): Record<string, unknown> {
  const row: Record<string, unknown> = { experimentId: bundle.experiment.experimentId, definitionVersion: bundle.experiment.definitionVersion, metricsVersion: bundle.experiment.metricsVersion, analysisRulesVersion: bundle.experiment.analysisRulesVersion, configHash: bundle.experiment.configHash, sessionId: bundle.session.sessionId, participantCode: bundle.session.participantCode, attemptId: bundle.session.attemptId, completed: bundle.quality.completed, focusLossCount: bundle.quality.focusLossCount, storageRecoveryUsed: bundle.quality.storageRecoveryUsed, qualityFlags: (bundle.quality.flags ?? []).join("|") };
  Object.entries(metrics.cleaned).forEach(([key, value]) => { row[key] = value; row[`raw_${key}`] = metrics.raw[key]; });
  Object.entries(metrics.byCondition).forEach(([condition, result]) => { row[`n_${condition}`] = result.n; row[`accuracy_${condition}`] = result.accuracy; row[`medianRtMs_${condition}`] = result.medianRtMs; });
  return row;
}

export function trialsCsv(bundle: ResultBundle): string {
  return toCsv(trialRows(bundle));
}

export function summaryCsv(bundle: ResultBundle, metrics: MetricsResult): string {
  return toCsv([summaryRow(bundle, metrics)]);
}

export function batchTrialsCsv(bundles: ResultBundle[]): string { return toCsv(bundles.flatMap(trialRows)); }
export function batchSummaryCsv(bundles: ResultBundle[]): string { return toCsv(bundles.map((bundle) => summaryRow(bundle, calculateMetrics(bundle.experiment.experimentId, bundle.trials)))); }

export function codebookCsv(definition: ExperimentDefinition): string {
  const specificFields: Record<string, Array<Record<string, unknown>>> = {
    "simple-rt": [{ field: "data.delayMs", description: "程序化刺激等待时间", unit: "ms", allowed: "integer", version: "1.0" }],
    "stroop-color-word": [{ field: "data.colorName", description: "字体颜色的内部标签", unit: "", allowed: "red|green|blue", version: "1.0" }, { field: "data.word", description: "呈现词项的内部标签", unit: "", allowed: "red|green|blue", version: "1.0" }, { field: "data.responseKey", description: "该试次颜色对应按键", unit: "key", allowed: "f|j|k", version: "1.0" }],
    "go-no-go": [{ field: "data.targetType", description: "Go 或 No-Go 刺激类型", unit: "", allowed: "go|no-go", version: "1.0" }],
    "mental-rotation": [{ field: "data.angle", description: "程序化旋转角度", unit: "degree", allowed: "0|45|90|135", version: "1.0" }, { field: "data.same", description: "图形是否同构", unit: "", allowed: "boolean", version: "1.0" }]
  };
  const rows = [
    { field: "format", description: "文件格式标识", unit: "", allowed: "psylab-result", version: "1.1" },
    { field: "formatVersion", description: "Result Bundle 公共格式版本", unit: "", allowed: "1.1", version: "1.1" },
    { field: "experiment.config", description: "经参数 schema 校验、并与 configHash 对应的实验配置快照", unit: "", allowed: "JSON object; no participant or teacher metadata", version: "1.1" },
    ...(definition.metadata.publicMetric ? [{ field: "metadata.publicMetric", description: `公众结果页的主指标：${definition.metadata.publicMetric.label}`, unit: "", allowed: definition.metadata.publicMetric.id, version: definition.definitionVersion }] : []),
    { field: "trialIndex", description: "正式/练习试次顺序", unit: "index", allowed: "integer", version: "1.0" },
    { field: "phase", description: "实验阶段", unit: "", allowed: "instruction|practice|test|break", version: "1.0" },
    { field: "condition", description: "实验条件", unit: "", allowed: definition.experimentId === "stroop-color-word" ? "congruent|incongruent" : "definition-specific", version: "1.0" },
    { field: "rtMs", description: "浏览器记录的反应时", unit: "ms", allowed: "number|null; non-lab precision", version: "1.0" },
    { field: "correct", description: "该响应是否符合预期", unit: "", allowed: "boolean|null", version: "1.0" },
    { field: "outcome", description: "试次结果类别；用于区分正确、错误、无响应和失焦", unit: "", allowed: "correct|incorrect|no-response|anticipation|focus-loss", version: "1.1" },
    { field: "excluded", description: "是否排除出摘要", unit: "", allowed: "boolean", version: "1.0" },
    { field: "exclusionReasons", description: "排除原因，可追溯原始数据", unit: "", allowed: "pipe-separated codes", version: "1.0" },
    ...definition.metrics.map((metric) => ({ field: metric.id, description: metric.description, unit: metric.unit, allowed: "number|null", version: "1.0.0" })),
    ...(specificFields[definition.experimentId] ?? [])
  ]; return toCsv(rows);
}

export function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8"): void { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
export function resultJsonFilename(bundle: ResultBundle): string { return `psylab-result-${bundle.experiment.experimentId}-${bundle.session.sessionId}-${bundle.session.participantCode}-${bundle.session.attemptId}.json`; }
export function downloadJson(bundle: ResultBundle): void { downloadText(resultJsonFilename(bundle), JSON.stringify(bundle, null, 2), "application/json;charset=utf-8"); }
/** 结果页的次要导出：JSON 已由单独按钮下载，这里只补 trial/摘要 CSV 与代码本。 */
export function downloadCsvFiles(bundle: ResultBundle, metrics: MetricsResult, definition: ExperimentDefinition): void { downloadText(`psylab-trials-${bundle.session.attemptId}.csv`, trialsCsv(bundle), "text/csv;charset=utf-8"); downloadText(`psylab-summary-${bundle.session.attemptId}.csv`, summaryCsv(bundle, metrics), "text/csv;charset=utf-8"); downloadText(`psylab-codebook-${bundle.experiment.experimentId}.csv`, codebookCsv(definition), "text/csv;charset=utf-8"); }
