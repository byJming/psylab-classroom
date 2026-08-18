import { describe, expect, it } from "vitest";
import { calculateMetrics, defaultConfig, definitionMap, definitions, generateTrials } from "../src/experiments";
import { canonicalize, sha256, sha256Fallback } from "../src/core/hash";
import { validateDefinition, validateResult, validateSession } from "../src/core/schema";
import { importResultFiles } from "../src/core/importer";
import { batchSummaryCsv, batchTrialsCsv, codebookCsv, parseCsv, resultJsonFilename, summaryCsv, trialsCsv } from "../src/core/export";
import { loadDraft, loadLatestResult, saveDraft, saveResult } from "../src/runtime/storage";
import { buildResultBundle } from "../src/core/result";
import { hasCompletedRequiredDebrief, validateRunManifest } from "../src/runtime/policy";
import { canStartPreflight } from "../src/runtime/preflight";
import { compileTimeline } from "../src/runtime/jspsychAdapter";
import type { ResultBundle, TrialRecord } from "../src/types";
import simpleFixture from "../fixtures/experiments/simple-rt.fixed.json";
import stroopFixture from "../fixtures/experiments/stroop-color-word.fixed.json";
import goNoGoFixture from "../fixtures/experiments/go-no-go.fixed.json";
import rotationFixture from "../fixtures/experiments/mental-rotation.fixed.json";
import simpleParameters from "../experiments/simple-rt/parameters.schema.json";
import stroopParameters from "../experiments/stroop-color-word/parameters.schema.json";

function trial(overrides: Partial<TrialRecord> = {}): TrialRecord {
  return { trialIndex: 0, phase: "test", condition: "congruent", stimulusId: "s1", correctResponse: "f", response: "f", correct: true, rtMs: 500, stimulusDurationMs: null, visibilityState: "visible", focusLostBeforeResponse: false, excluded: false, exclusionReasons: [], data: {}, ...overrides };
}

function bundle(overrides: Partial<ResultBundle> = {}): ResultBundle {
  return { format: "psylab-result", formatVersion: "1.1", experiment: { experimentId: "stroop-color-word", definitionVersion: "1.1.0", metricsVersion: "1.0.0", analysisRulesVersion: "1.0.0", distributionTier: "open", runPolicyVersion: "1.0.0", configHash: "sha256:f47e6eb4fb1000caabb2067d762d0e8ed9525d7067a22f130bc19d222603f7ba", config: { practiceTrials: 4, testTrials: 16 } }, session: { sessionId: "session-001", participantCode: "p01", attemptId: "attempt-001", randomSeed: "seed" }, environment: { browserFamily: "Chromium", platformFamily: "Windows", viewportBucket: "large", inputMode: "keyboard" }, quality: { completed: false, focusLossCount: 0, fullscreenExitCount: 0, storageRecoveryUsed: true, flags: ["interrupted"] }, trials: [trial(), trial({ trialIndex: 1, condition: "incongruent", rtMs: 650 }), trial({ trialIndex: 2, condition: "incongruent", correct: false, response: "j", rtMs: 700, excluded: true, exclusionReasons: ["incorrect"] })], summary: {}, exportedAt: "2026-08-18T00:00:00.000Z", ...overrides };
}

describe("契约与确定性", () => {
  it("所有 Definition 通过 JSON Schema", () => { expect(definitions.every((definition) => validateDefinition(definition).valid)).toBe(true); });
  it("每个公开实验都声明可供公众理解的主指标", () => { for (const definition of definitions.filter((item) => item.runPolicy.publicCatalog)) { expect(definition.metadata.publicMetric).toBeDefined(); const metric = definition.metadata.publicMetric!; expect(definition.metrics.some((item) => item.id === metric.id)).toBe(true); } });
  it("黄金实验参数 schema 与 Definition 的配置边界一致", () => { expect(simpleParameters.required).toEqual(["practiceTrials", "testTrials"]); expect(stroopParameters.required).toEqual(["practiceTrials", "testTrials"]); expect((stroopParameters.properties as { testTrials: { multipleOf: number } }).testTrials.multipleOf).toBe(2); });
  it("Definition schema 拒绝缺少教学背景和变量声明的实验包", () => { const incomplete = { ...definitions[0], metadata: { ...definitions[0].metadata, theoryBackground: "" } }; expect(validateDefinition(incomplete).valid).toBe(false); });
  it("Session 和 Result Bundle 通过 schema，旧 Result 格式被拒绝", async () => { const hash = await sha256({ testTrials: 24 }); const session = { format: "psylab-session", formatVersion: "1.0", experimentId: "simple-rt", definitionVersion: "1.0.0", distributionTier: "open", runPolicyVersion: "1.0.0", config: { testTrials: 24, practiceTrials: 3 }, configHash: hash, sessionId: "session-001", createdAt: "2026-08-18T00:00:00.000Z" }; expect(validateSession(session).valid).toBe(true); expect(validateResult(bundle()).valid).toBe(true); expect(validateResult({ ...bundle(), formatVersion: "1.0" }).valid).toBe(false); });
  it("规范化哈希忽略对象键顺序", async () => { expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 })); expect(await sha256({ b: 2, a: 1 })).toBe(await sha256({ a: 1, b: 2 })); });
  it("普通 HTTP 静态服务器的 SHA-256 fallback 与标准向量一致", () => { expect(sha256Fallback(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); });
  it("固定种子生成稳定 trial 数和顺序", () => { const first = generateTrials("stroop-color-word", defaultConfig("stroop-color-word"), "seed"); const second = generateTrials("stroop-color-word", defaultConfig("stroop-color-word"), "seed"); expect(first).toEqual(second); expect(first.filter((plan) => plan.phase === "test")).toHaveLength(24); });
  it("固定 fixtures 的 Definition/Runner 结构与预期一致", () => { for (const fixture of [simpleFixture, stroopFixture, goNoGoFixture, rotationFixture]) { const plans = generateTrials(fixture.experimentId, fixture.config, fixture.seed); expect(plans.filter((plan) => plan.phase === "practice")).toHaveLength(fixture.expected.practiceCount); expect(plans.filter((plan) => plan.phase === "test")).toHaveLength(fixture.expected.testCount); expect(new Set(plans.map((plan) => plan.condition)).size).toBeGreaterThan(0); } });
  it("心理旋转的同形与镜像条件呈现稳定的程序化几何刺激", () => { const plans = generateTrials("mental-rotation", rotationFixture.config, rotationFixture.seed); expect(new Set(plans.map((plan) => plan.stimulus))).toEqual(new Set(["geometry"])); expect(plans.filter((plan) => plan.condition.startsWith("same-")).every((plan) => plan.data.stimulusType === "corner-blocks" && plan.data.same === true)).toBe(true); expect(plans.filter((plan) => plan.condition.startsWith("mirror-")).every((plan) => plan.data.stimulusType === "corner-blocks" && plan.data.same === false)).toBe(true); });
  it("四个 P0 实验都生成可解释的练习与正式 trial", () => { for (const definition of definitions) { const plans = generateTrials(definition.experimentId, defaultConfig(definition.experimentId), "fixed-fixture-seed"); expect(plans.some((plan) => plan.phase === "practice")).toBe(true); expect(plans.some((plan) => plan.phase === "test")).toBe(true); expect(plans.every((plan) => plan.stimulusId.length > 0)).toBe(true); } });
  it("公开 Runner 对 open、guided 和 controlled 发布策略执行对应门禁", async () => {
    const definition = definitions[0]; const config = defaultConfig(definition.experimentId); const configHash = await sha256(config);
    const manifest = { format: "psylab-session" as const, formatVersion: "1.0", experimentId: definition.experimentId, definitionVersion: definition.definitionVersion, distributionTier: "open" as const, runPolicyVersion: definition.runPolicy.version, config, configHash, sessionId: "policy-open-01", createdAt: "2026-08-18T00:00:00.000Z" };
    await expect(validateRunManifest(manifest, definition)).resolves.toEqual([]);
    const guided = { ...definition, runPolicy: { ...definition.runPolicy, tier: "guided" as const, publicCatalog: false, requiresTeacherAcknowledgement: true, requiresDebrief: true } };
    const guidedManifest = { ...manifest, distributionTier: "guided" as const, config: { ...config, teacherAcknowledged: false } };
    await expect(validateRunManifest(guidedManifest, guided)).resolves.toContain("引导层会话缺少教师确认记录");
    await expect(validateRunManifest({ ...guidedManifest, config: { ...config, teacherAcknowledged: true } }, guided)).resolves.toEqual([]);
    await expect(validateRunManifest({ ...manifest, definitionVersion: "0.9.0" }, definition)).resolves.toContain("会话 Definition 版本与当前版本不一致");
    await expect(validateRunManifest({ ...manifest, experimentId: "other-experiment" }, definition)).resolves.toContain("会话实验 ID 与当前 Definition 不一致");
    expect(hasCompletedRequiredDebrief(bundle(), guided)).toBe(false);
    expect(hasCompletedRequiredDebrief(bundle({ quality: { ...bundle().quality, flags: ["debrief-completed"] } }), guided)).toBe(true);
    const controlled = { ...guided, runPolicy: { ...guided.runPolicy, tier: "controlled" as const, requiresTeacherAcknowledgement: true } };
    await expect(validateRunManifest({ ...manifest, distributionTier: "controlled" as const, config: { ...config, teacherAcknowledged: true } }, controlled)).resolves.toContain("受控层实验不在公共静态站点运行，请按本地伦理与部署流程处理。");
  });
  it("jsPsych 适配层为每个 TrialPlan 生成注视期 + 响应窗时间线", () => {
    const plans = generateTrials("go-no-go", defaultConfig("go-no-go"), "jspsych-fixture");
    const timeline = compileTimeline(plans);
    expect(timeline).toHaveLength(plans.length * 2);
    expect(timeline[0].type).toBeDefined();
    expect(timeline[0].data.stimulusId).toBe(plans[0].stimulusId);
    expect(timeline[0].data.role).toBe("delay");
    expect(timeline[1].data.role).toBe("response");
    expect(timeline.every((trial) => Array.isArray(trial.choices) || typeof trial.choices === "function")).toBe(true);
  });
  it("时间线携带注视点与试次间隔；敏感实验的注视期按键立即结束并切换反馈", () => {
    const plans = generateTrials("simple-rt", defaultConfig("simple-rt"), "adapter-seed");
    const timeline = compileTimeline(plans);
    const [fixation, response] = timeline;
    expect(fixation.stimulus).toContain("measured-fixation");
    expect(fixation.response_ends_trial).toBe(true);
    expect(fixation.trial_duration).toBe(plans[0].data.fixationMs);
    expect(response.post_trial_gap).toBeGreaterThan(0);
    expect(typeof response.stimulus).toBe("function");
    expect(typeof response.choices).toBe("function");
    expect((response.choices as () => string[])()).toEqual([" "]);
    const early = compileTimeline(plans, undefined, { earlyResponses: new Set([0]) });
    expect((early[1].stimulus as () => string)()).toContain("measured-feedback");
    expect((early[1].choices as () => string[])()).toEqual([]);
    expect((early[1].trial_duration as () => number)()).toBe(900);
    const stroopTimeline = compileTimeline(generateTrials("stroop-color-word", defaultConfig("stroop-color-word"), "adapter-seed"));
    expect(stroopTimeline[0].response_ends_trial).toBe(false);
    expect(stroopTimeline[0].trial_duration).toBeGreaterThan(0);
    expect(stroopTimeline[1].trial_duration).toBe(2500);
  });
  it("每个试次都携带注视、间隔与响应窗节奏字段", () => {
    for (const definition of definitions) {
      const plans = generateTrials(definition.experimentId, defaultConfig(definition.experimentId), "pacing-seed");
      expect(plans.length).toBeGreaterThan(0);
      for (const plan of plans) {
        expect(Number(plan.data.fixationMs)).toBeGreaterThanOrEqual(400);
        expect(Number(plan.data.itiMs)).toBeGreaterThanOrEqual(300);
        expect(Number(plan.data.responseWindowMs)).toBeGreaterThanOrEqual(500);
      }
      if (definition.experimentId === "simple-rt") expect(plans.every((plan) => Number(plan.data.fixationMs) >= 800 && plan.data.anticipationSensitive === true)).toBe(true);
      if (definition.experimentId === "go-no-go") expect(plans.every((plan) => plan.data.anticipationSensitive === true)).toBe(true);
    }
  });
  it("responseWindowMs 配置覆写响应窗且无需响应的试次不超过 1000ms", () => {
    const plans = generateTrials("go-no-go", { practiceTrials: 4, testTrials: 20, goRatio: 0.7, responseWindowMs: 1600 }, "window-seed");
    expect(plans.filter((plan) => plan.data.targetType === "go").every((plan) => plan.data.responseWindowMs === 1600)).toBe(true);
    expect(plans.filter((plan) => plan.data.targetType === "no-go").every((plan) => plan.data.responseWindowMs === 1000)).toBe(true);
  });
  it("Stroop 条件与目标颜色交叉单元格平衡且干扰词不等于目标颜色", () => {
    const plans = generateTrials("stroop-color-word", defaultConfig("stroop-color-word"), "stroop-seed").filter((plan) => plan.phase === "test");
    const cells = new Map<string, number>();
    for (const plan of plans) cells.set(`${plan.condition}-${String(plan.data.colorName)}`, (cells.get(`${plan.condition}-${String(plan.data.colorName)}`) ?? 0) + 1);
    expect(cells.size).toBe(6);
    expect(Math.max(...cells.values()) - Math.min(...cells.values())).toBeLessThanOrEqual(1);
    for (const plan of plans) {
      if (plan.condition === "congruent") expect(plan.data.word).toBe(plan.data.colorName);
      else expect(plan.data.word).not.toBe(plan.data.colorName);
    }
  });
  it("心理旋转的同异×角度交叉平衡且不出现固定交替序列", () => {
    const plans = generateTrials("mental-rotation", { practiceTrials: 8, testTrials: 24 }, "rotation-seed");
    const cells = new Map<string, number>();
    for (const plan of plans) cells.set(`${String(plan.data.same)}-${String(plan.data.angle)}`, (cells.get(`${String(plan.data.same)}-${String(plan.data.angle)}`) ?? 0) + 1);
    expect(cells.size).toBe(8);
    expect(Math.max(...cells.values()) - Math.min(...cells.values())).toBeLessThanOrEqual(1);
    const sameSequence = plans.filter((plan) => plan.phase === "test").map((plan) => Boolean(plan.data.same));
    expect(sameSequence.slice(0, -1).some((same, index) => same === sameSequence[index + 1])).toBe(true);
    const angleSequence = plans.filter((plan) => plan.phase === "test").map((plan) => Number(plan.data.angle));
    expect(angleSequence.slice(0, -1).some((angle, index) => angle === angleSequence[index + 1])).toBe(true);
  });
  it("预检只允许本地存储降级，阻止键盘、桌面视口、可见性和资源失败", () => {
    const healthy = [{ id: "keyboard", label: "键盘", ok: true, detail: "" }, { id: "viewport", label: "视口", ok: true, detail: "" }, { id: "visibility", label: "可见", ok: true, detail: "" }, { id: "resource", label: "资源", ok: true, detail: "" }, { id: "storage", label: "存储", ok: false, detail: "" }];
    expect(canStartPreflight(healthy)).toBe(true);
    expect(canStartPreflight(healthy.map((check) => check.id === "resource" ? { ...check, ok: false } : check))).toBe(false);
  });
});

describe("Metrics", () => {
  it("区分原始与清洗统计并保留排除原因", () => { const result = calculateMetrics("stroop-color-word", bundle().trials); expect(result.raw.accuracy).toBeCloseTo(66.666, 2); expect(result.cleaned.accuracy).toBeCloseTo(66.666, 2); expect(result.raw.stroop_interference_ms).toBe(150); expect(result.excluded).toEqual([{ trialIndex: 2, reasons: ["incorrect"] }]); });
  it("正确率保留错误 trial，反应时清洗不会把错误变成正确", () => { const result = calculateMetrics("go-no-go", [trial({ condition: "go", correct: true, correctResponse: " ", response: " ", excluded: false }), trial({ trialIndex: 1, condition: "no-go", correct: false, correctResponse: null, response: " ", rtMs: 420, excluded: true, exclusionReasons: ["incorrect"] }), trial({ trialIndex: 2, condition: "no-go", correct: true, correctResponse: null, response: null, rtMs: null, excluded: false })]); expect(result.raw.go_accuracy).toBe(100); expect(result.raw.no_go_false_alarm).toBe(50); expect(result.cleaned.go_accuracy).toBe(100); expect(result.cleaned.no_go_false_alarm).toBe(50); });
  it("全错、无响应和失焦会打质量标记", () => { const result = calculateMetrics("go-no-go", [trial({ condition: "go", correct: false, response: "j", excluded: true, exclusionReasons: ["incorrect"] }), trial({ trialIndex: 1, condition: "no-go", correct: false, correctResponse: null, response: " ", rtMs: null, focusLostBeforeResponse: true, excluded: true, exclusionReasons: ["incorrect", "focus-loss"] })]); expect(result.qualityFlags).toContain("no-valid-test-trials"); expect(result.qualityFlags).toContain("low-accuracy"); expect(result.excluded).toHaveLength(2); });
  it("缺字段的原始 trial 不会让 Metrics 崩溃", () => { const result = calculateMetrics("simple-rt", [trial({ rtMs: null, correct: null, response: null, excluded: true, exclusionReasons: ["no-response"] })]); expect(result.raw.median_rt_ms).toBeNull(); });
  it("每个 P0 Metrics 对正常、全错、无响应和失焦数据保持稳定", () => { for (const definition of definitions) { const normal = trial({ condition: definition.experimentId === "go-no-go" ? "go" : "baseline" }); const wrong = trial({ trialIndex: 1, correct: false, response: "x", excluded: true, exclusionReasons: ["incorrect"] }); const missing = trial({ trialIndex: 2, response: null, correct: null, rtMs: null, excluded: true, exclusionReasons: ["no-response"], focusLostBeforeResponse: true }); const result = calculateMetrics(definition.experimentId, [normal, wrong, missing]); expect(result.metricsVersion).toBe("1.0.0"); expect(result.excluded).toHaveLength(2); } });
});

describe("导出与导入", () => {
  it("CSV 含 UTF-8 BOM 且可以 round-trip 解析，JSON 结果也可导入", async () => { const value = bundle(); const trialCsv = trialsCsv(value); expect(trialCsv.startsWith("\uFEFF")).toBe(true); const parsedTrials = parseCsv(trialCsv); expect(parsedTrials).toHaveLength(value.trials.length); expect(parsedTrials[0].participantCode).toBe(value.session.participantCode); expect(parsedTrials[0].stimulusId).toBe(value.trials[0].stimulusId); expect(summaryCsv(value, calculateMetrics(value.experiment.experimentId, value.trials))).toContain("stroop_interference_ms"); const file = new File([JSON.stringify(value)], "result.json", { type: "application/json" }); const report = await importResultFiles([file]); expect(report.accepted).toHaveLength(1); expect(report.errors).toHaveLength(0); });
  it("配置快照可重建完整 trial 结构，篡改后被拒绝", async () => {
    const config = { practiceTrials: 4, testTrials: 16 }; const seed = "structural-seed"; const plans = generateTrials("stroop-color-word", config, seed); const fullTrials = plans.map((plan, index) => trial({ trialIndex: index, phase: plan.phase, condition: plan.condition, stimulusId: plan.stimulusId, correctResponse: plan.correctResponse, response: plan.correctResponse, data: plan.data }));
    const value = bundle({ experiment: { ...bundle().experiment, config, configHash: await sha256(config) }, session: { ...bundle().session, randomSeed: seed, attemptId: "structural-attempt" }, quality: { ...bundle().quality, completed: true, storageRecoveryUsed: false, flags: [] }, trials: fullTrials });
    const report = await importResultFiles([new File([JSON.stringify(value)], "complete.json")]); expect(report.accepted).toHaveLength(1); expect(report.errors).toHaveLength(0);
    const tampered = { ...value, trials: [{ ...fullTrials[0], condition: "tampered" }, ...fullTrials.slice(1)] }; const tamperedReport = await importResultFiles([new File([JSON.stringify(tampered)], "tampered.json")]); expect(tamperedReport.accepted).toHaveLength(0); expect(tamperedReport.errors.some((error) => error.reasons.join().includes("trial 阶段"))).toBe(true);
  });
  it("导入器拦截不自洽的篡改：correct、排除标记与超窗反应时", async () => {
    const config = { practiceTrials: 4, testTrials: 16 }; const seed = "tamper-seed"; const plans = generateTrials("stroop-color-word", config, seed);
    const make = async (attemptId: string, mutate?: (trials: TrialRecord[]) => TrialRecord[]) => {
      let trials = plans.map((plan, index) => trial({ trialIndex: index, phase: plan.phase, condition: plan.condition, stimulusId: plan.stimulusId, correctResponse: plan.correctResponse, response: plan.correctResponse, data: plan.data }));
      if (mutate) trials = mutate(trials);
      return bundle({ experiment: { ...bundle().experiment, config, configHash: await sha256(config) }, session: { ...bundle().session, randomSeed: seed, attemptId }, quality: { ...bundle().quality, completed: false, flags: ["interrupted"] }, trials });
    };
    const importOne = async (value: ReturnType<typeof bundle>) => await importResultFiles([new File([JSON.stringify(value)], `${value.session.attemptId}.json`)]);
    const honest = await make("honest-attempt"); expect((await importOne(honest)).accepted).toHaveLength(1);
    // 学生把错误响应的 correct 改成 true，但 response/correctResponse 仍矛盾。
    const fakeCorrect = await make("fake-correct", (trials) => trials.map((item, index) => index === 2 ? { ...item, correctResponse: "f", response: "j", correct: true } : item));
    expect((await importOne(fakeCorrect)).errors.some((error) => error.reasons.join().includes("correct 标记"))).toBe(true);
    // 学生删掉错误 trial 的排除标记。
    const fakeExcluded = await make("fake-excluded", (trials) => trials.map((item, index) => index === 2 ? { ...item, correctResponse: "f", response: "j", correct: false, excluded: false } : item));
    expect((await importOne(fakeExcluded)).errors.some((error) => error.reasons.join().includes("排除标记"))).toBe(true);
    // 学生把反应时改得超出该试次响应窗。
    const fakeRt = await make("fake-rt", (trials) => trials.map((item, index) => index === 5 ? { ...item, rtMs: 9000 } : item));
    expect((await importOne(fakeRt)).errors.some((error) => error.reasons.join().includes("超出该试次响应窗"))).toBe(true);
  });
  it("完整结果的程序化字段与固定随机计划逐一比对，就地篡改 data 被拒绝", async () => {
    const config = { practiceTrials: 4, testTrials: 16 }; const seed = "tamper-data-seed"; const plans = generateTrials("stroop-color-word", config, seed); const fullTrials = plans.map((plan, index) => trial({ trialIndex: index, phase: plan.phase, condition: plan.condition, stimulusId: plan.stimulusId, correctResponse: plan.correctResponse, response: plan.correctResponse, data: plan.data }));
    const value = bundle({ experiment: { ...bundle().experiment, config, configHash: await sha256(config) }, session: { ...bundle().session, randomSeed: seed, attemptId: "data-attempt" }, quality: { ...bundle().quality, completed: true, storageRecoveryUsed: false, flags: [] }, trials: fullTrials });
    const flipped = fullTrials.map((item, index) => index === 5 ? { ...item, data: { ...item.data, congruent: !(item.data as { congruent: boolean }).congruent } } : item);
    const report = await importResultFiles([new File([JSON.stringify({ ...value, trials: flipped })], "flipped.json")]);
    expect(report.accepted).toHaveLength(0);
    expect(report.errors.some((error) => error.reasons.join().includes("程序化字段"))).toBe(true);
  });
  it("同一参与者的多次不同尝试保留并提醒，而不是拒收", async () => {
    const config = { practiceTrials: 4, testTrials: 16 }; const seed = "multi-attempt-seed"; const plans = generateTrials("stroop-color-word", config, seed); const fullTrials = plans.map((plan, index) => trial({ trialIndex: index, phase: plan.phase, condition: plan.condition, stimulusId: plan.stimulusId, correctResponse: plan.correctResponse, response: plan.correctResponse, data: plan.data }));
    const make = async (attemptId: string) => bundle({ experiment: { ...bundle().experiment, config, configHash: await sha256(config) }, session: { ...bundle().session, randomSeed: seed, attemptId }, quality: { ...bundle().quality, completed: true, storageRecoveryUsed: false, flags: [] }, trials: fullTrials });
    const report = await importResultFiles([new File([JSON.stringify(await make("attempt-a"))], "a.json"), new File([JSON.stringify(await make("attempt-b"))], "b.json")]);
    expect(report.accepted).toHaveLength(2); expect(report.errors).toHaveLength(0);
    expect(report.warnings.some((warning) => warning.reasons.join().includes("不同尝试"))).toBe(true);
  });
  it("教师批量导出同时提供 trial、participant-summary 和当前格式代码本", () => { const value = bundle(); expect(batchTrialsCsv([value])).toContain("trialIndex"); expect(batchSummaryCsv([value])).toContain("participantCode"); expect(codebookCsv(definitionMap["stroop-color-word"])).toContain("experiment.config"); expect(codebookCsv(definitionMap["stroop-color-word"])).toContain("1.1"); });
  it("结果文件名包含实验、会话、参与者代码和尝试号供回收对号", () => { expect(resultJsonFilename(bundle())).toBe("psylab-result-stroop-color-word-session-001-p01-attempt-001.json"); });
  it("重复提交和混合实验会被拒绝", async () => { const a = new File([JSON.stringify(bundle())], "a.json"); const duplicate = new File([JSON.stringify(bundle())], "b.json"); const report = await importResultFiles([a, duplicate]); expect(report.accepted).toHaveLength(0); expect(report.errors.some((error) => error.reasons.join().includes("重复"))).toBe(true); const mixed = bundle({ experiment: { ...bundle().experiment, experimentId: "simple-rt" } }); const mixedReport = await importResultFiles([a, new File([JSON.stringify(mixed)], "mixed.json")]); expect(mixedReport.accepted).toHaveLength(0); expect(mixedReport.errors.some((error) => error.reasons.join().includes("多个实验"))).toBe(true); });
  it("同实验的 Definition、Metrics 或配置版本不一致会被拒绝", async () => { const current = bundle(); const older = bundle({ session: { ...bundle().session, attemptId: "attempt-002" }, experiment: { ...bundle().experiment, definitionVersion: "0.9.0" } }); const report = await importResultFiles([new File([JSON.stringify(current)], "current.json"), new File([JSON.stringify(older)], "older.json")]); expect(report.accepted).toHaveLength(0); expect(report.errors.some((error) => error.reasons.join().includes("definitionVersion"))).toBe(true); });
  it("导入器拒绝与当前 Metrics 或分析规则不一致的结果", async () => {
    const metricsMismatch = bundle({ experiment: { ...bundle().experiment, metricsVersion: "9.0.0" } });
    const rulesMismatch = bundle({ session: { ...bundle().session, attemptId: "attempt-rules" }, experiment: { ...bundle().experiment, analysisRulesVersion: "9.0.0" } });
    const report = await importResultFiles([new File([JSON.stringify(metricsMismatch)], "metrics.json"), new File([JSON.stringify(rulesMismatch)], "rules.json")]);
    expect(report.accepted).toHaveLength(0);
    expect(report.errors.some((error) => error.reasons.join().includes("Metrics 版本"))).toBe(true);
    expect(report.errors.some((error) => error.reasons.join().includes("分析规则版本"))).toBe(true);
    const mixedReport = await importResultFiles([new File([JSON.stringify(bundle())], "current.json"), new File([JSON.stringify(metricsMismatch)], "mixed-metrics.json")]);
    expect(mixedReport.accepted).toHaveLength(0);
  });
  it("导入器拒绝缺少 debrief-completed 的 guided 结果", async () => {
    const original = definitionMap["stroop-color-word"];
    definitionMap["stroop-color-word"] = { ...original, runPolicy: { ...original.runPolicy, tier: "guided", publicCatalog: false, requiresTeacherAcknowledgement: true, requiresDebrief: true } };
    try {
      const guided = bundle({ experiment: { ...bundle().experiment, distributionTier: "guided" } });
      const report = await importResultFiles([new File([JSON.stringify(guided)], "guided.json")]);
      expect(report.accepted).toHaveLength(0);
      expect(report.errors[0].reasons.join()).toContain("debrief-completed");
    } finally {
      definitionMap["stroop-color-word"] = original;
    }
  });
  it("会话基线会校验 Definition 与 runPolicy 版本", async () => { const result = await importResultFiles([new File([JSON.stringify(bundle())], "result.json")], { experimentId: "stroop-color-word", definitionVersion: "0.9.0", runPolicyVersion: "1.0.0", configHash: bundle().experiment.configHash, distributionTier: "open" }); expect(result.accepted).toHaveLength(0); expect(result.errors[0].reasons.join()).toContain("Definition"); });
  it("未知的 Experiment Definition 会被导入器拒绝", async () => { const unknown = bundle({ experiment: { ...bundle().experiment, experimentId: "unknown-experiment" } }); const report = await importResultFiles([new File([JSON.stringify(unknown)], "unknown.json")]); expect(report.accepted).toHaveLength(0); expect(report.errors[0].reasons.join()).toContain("Definition"); });
  it("缺字段文件生成错误报告数据", async () => { const file = new File(["{}"], "missing.json"); const report = await importResultFiles([file]); expect(report.accepted).toHaveLength(0); expect(report.errors[0].reasons.length).toBeGreaterThan(0); });
  it("中断结果通过同一 Result Bundle schema 并保留 interrupted 标记", () => {
    const definition = definitions.find((item) => item.experimentId === "simple-rt")!;
    const manifest = { format: "psylab-session" as const, formatVersion: "1.0", experimentId: definition.experimentId, definitionVersion: definition.definitionVersion, distributionTier: definition.runPolicy.tier, runPolicyVersion: definition.runPolicy.version, config: defaultConfig(definition.experimentId), configHash: "sha256:" + "a".repeat(64), sessionId: "interrupt-001", createdAt: "2026-08-18T00:00:00.000Z" };
    const value = buildResultBundle({ definition, manifest, participantCode: "p01", attemptId: "attempt-001", randomSeed: "seed", environment: { browserFamily: "Chromium", platformFamily: "Windows", viewportBucket: "large", inputMode: "keyboard" }, focusLossCount: 1, fullscreenExitCount: 0, storageRecoveryUsed: false, trials: [trial({ correctResponse: " ", response: " ", condition: "target" })], completed: false, exportedAt: "2026-08-18T00:00:00.000Z" });
    expect(validateResult(value).valid).toBe(true);
    expect(value.quality.completed).toBe(false);
    expect(value.quality.flags).toContain("interrupted");
  });
  it("trial outcome 可区分提前反应且仍保留原始响应", () => { const value = bundle({ trials: [trial({ response: " ", correct: false, outcome: "anticipation", excluded: true, exclusionReasons: ["anticipation"] })] }); expect(validateResult(value).valid).toBe(true); expect(value.trials[0].outcome).toBe("anticipation"); expect(value.trials[0].response).toBe(" "); });
});

describe("本地持久化降级", () => {
  it("IndexedDB 不可用时使用内存草稿并明确返回降级状态", async () => {
    const manifest = { format: "psylab-session" as const, formatVersion: "1.0", experimentId: "simple-rt", definitionVersion: "1.0.0", distributionTier: "open" as const, runPolicyVersion: "1.0.0", config: { practiceTrials: 3, testTrials: 12 }, configHash: "sha256:" + "c".repeat(64), sessionId: "storage-fixture-01", createdAt: "2026-08-18T00:00:00.000Z" };
    expect(await saveDraft("memory-fallback", { manifest, participantCode: "p01", attemptId: "a01", randomSeed: "seed", trials: [], focusLossCount: 0, storageRecoveryUsed: true })).toBe(false);
    expect((await loadDraft("memory-fallback"))?.storageRecoveryUsed).toBe(true);
  });
  it("完成结果可从本地结果槽恢复", async () => { const value = bundle(); await saveResult(value); expect((await loadLatestResult())?.session.attemptId).toBe(value.session.attemptId); });
});
