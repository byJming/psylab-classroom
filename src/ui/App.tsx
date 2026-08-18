import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { calculateMetrics, defaultConfig, definitionMap, definitions, generateTrials } from "../experiments";
import { makeId, sha256 } from "../core/hash";
import { validateConfig, validateDefinition, validateSession } from "../core/schema";
import { batchSummaryCsv, batchTrialsCsv, codebookCsv, downloadCsvFiles, downloadJson, downloadText, resultJsonFilename } from "../core/export";
import { errorReportCsv, importResultFiles, readJsonFile } from "../core/importer";
import { buildResultBundle } from "../core/result";
import type { ExperimentDefinition, ImportReport, MetricsResult, ResultBundle, SessionManifest, TrialRecord } from "../types";
import { deleteDraft, listDrafts, loadDraft, loadLatestResult, saveDraft, saveResult } from "../runtime/storage";
import { browserFamily, platformFamily, runPreflight, viewportBucket } from "../runtime/preflight";
import { experimentConfig, hasCompletedRequiredDebrief, validateRunManifest } from "../runtime/policy";
import { compileTimeline, createJsPsychRuntime } from "../runtime/jspsychAdapter";
import { conditionLabel, qualityFlagLabels, tierStatusLabel, viewportBucketLabels } from "./labels";
import { JsPsychStage } from "./JsPsychStage";

type View = { page: "home" } | { page: "detail"; id: string } | { page: "classroom" } | { page: "run"; manifest: SessionManifest } | { page: "results"; bundle: ResultBundle | null } | { page: "import" };

function encodeJson(value: unknown): string { return btoa(unescape(encodeURIComponent(JSON.stringify(value)))); }
function decodeJson<T>(value: string): T | null { try { return JSON.parse(decodeURIComponent(escape(atob(value)))) as T; } catch { return null; } }
function parseHash(): View { const raw = window.location.hash.replace(/^#\/?/, ""); if (!raw || raw === "home") return { page: "home" }; if (raw === "classroom") return { page: "classroom" }; if (raw === "teacher-import") return { page: "import" }; if (raw === "results") return { page: "results", bundle: null }; if (raw.startsWith("detail/")) return { page: "detail", id: raw.slice(7) }; if (raw.startsWith("run/")) { const manifest = decodeJson<SessionManifest>(raw.slice(4)); if (manifest) return { page: "run", manifest }; } return { page: "home" }; }
function navigate(view: View): void { if (view.page === "home") window.location.hash = "#/home"; else if (view.page === "detail") window.location.hash = `#/detail/${view.id}`; else if (view.page === "classroom") window.location.hash = "#/classroom"; else if (view.page === "import") window.location.hash = "#/teacher-import"; else if (view.page === "results") window.location.hash = "#/results"; else window.location.hash = `#/run/${encodeJson(view.manifest)}`; window.scrollTo(0, 0); }
async function enterFullscreen(): Promise<void> { if (document.fullscreenElement) return; try { await document.documentElement.requestFullscreen?.(); } catch { /* Fullscreen is an enhancement; blocked permission must not block the run. */ } }
async function exitFullscreen(): Promise<void> { if (!document.fullscreenElement) return; try { await document.exitFullscreen?.(); } catch { /* A browser may reject exit during navigation. */ } }

const participantCodePattern = /^[A-Za-z0-9_-]{0,24}$/;

const taskGuides: Record<string, { focus: string; response: string; sequence: string; visual: string }> = {
  "simple-rt": { focus: "观察你从看到目标到按下空格的反应时。", response: "先注视中央＋号；圆点出现后立即按空格。注视期间按键会被记为提前反应并提示。", sequence: "每个试次先呈现注视点，目标出现后响应，短暂间隔后进入下一试次。", visual: "中央十字是注视点，圆点出现时作答。" },
  "stroop-color-word": { focus: "比较词义与字体颜色一致或冲突时的反应差异。", response: "只看字体颜色：红色 F、绿色 J、蓝色 K；不要按词义。", sequence: "每个试次先注视中央＋号，颜色词出现后作答，按键后进入下一试次。", visual: "颜色是作答依据，文字内容只是干扰。" },
  "go-no-go": { focus: "观察需要行动和需要抑制反应时的差别。", response: "看到圆形按空格；看到方形保持不按，等待画面自动切换。注视期间按键会被记为提前反应。", sequence: "每个试次先呈现注视点，随后出现圆形或方形；未响应的方形会自动记录。", visual: "圆形与方形只用形状区分，请按形状判断。" },
  "mental-rotation": { focus: "判断两个图形经过旋转后是否仍为同一个形状。", response: "同形按 F，镜像不同按 J；比较整体结构，不要追求抢答。", sequence: "每个试次先注视中央＋号，左右图形以不同角度出现，按键后进入下一试次。", visual: "两侧图形各自偏离竖直方向，请比较整体结构而不是局部细节。" },
  "choice-rt": { focus: "观察可选项变多时，作出正确反应所需时间的变化。", response: "按圆点颜色作答：2 选 1 为红 F / 蓝 J；4 选 1 为红 F、绿 G、蓝 J、紫 K。", sequence: "每个试次先注视中央＋号，彩色圆点出现后作答，按键后进入下一试次。", visual: "颜色是作答依据；先确认颜色再按键，不要抢答。" },
  "flanker": { focus: "观察周围干扰箭头对中央目标判断的影响。", response: "只看中央箭头方向：向左按 F，向右按 J；忽略两侧箭头。", sequence: "每个试次先注视中央＋号，箭头阵列出现后作答，按键后进入下一试次。", visual: "五个箭头排成一行，作答依据只有正中间那个。" },
  "simon": { focus: "观察刺激出现位置是否影响按颜色作答。", response: "只看颜色：红色按 F，绿色按 J；位置不是作答依据。", sequence: "每个试次先注视中央＋号，圆形可能出现在左侧或右侧，按键后进入下一试次。", visual: "圆形位置会变化，请只根据颜色作答。" },
  "visual-search": { focus: "比较简单搜索与困难搜索中逐项查找的效率。", response: "找到红色圆形目标按 J；确定没有目标按 F。", sequence: "每个试次先注视中央＋号，搜索陈列出现后作答，按键后进入下一试次。", visual: "特征搜索中目标很醒目；结合搜索需要逐个检查颜色与形状两个特征。" }
};

export function App() {
  const [view, setView] = useState<View>(parseHash);
  useEffect(() => { const onHash = () => setView(parseHash()); window.addEventListener("hashchange", onHash); return () => window.removeEventListener("hashchange", onHash); }, []);
  const [lastResult, setLastResult] = useState<ResultBundle | null>(null);
  useEffect(() => { if (view.page === "results" && !lastResult) void loadLatestResult().then(setLastResult); }, [view.page, lastResult]);
  const goHome = () => navigate({ page: "home" });
  return <div className={`app-shell ${view.page === "run" ? "run-mode" : ""}`}>
    <header className="topbar"><button className="brand" onClick={goHome} aria-label="返回体验馆"><span className="brand-mark" aria-hidden="true">PL</span><span>PsyLab</span></button><nav><button onClick={goHome}>体验馆</button><button onClick={() => navigate({ page: "classroom" })}>课堂会话</button><button onClick={() => navigate({ page: "import" })}>教师导入</button></nav></header>
    <main>{view.page === "home" && <HomePage onDetail={(id) => navigate({ page: "detail", id })} onClassroom={() => navigate({ page: "classroom" })} onResume={(manifest) => navigate({ page: "run", manifest })} onResults={() => navigate({ page: "results", bundle: null })} />}{view.page === "detail" && <DetailPage definition={definitionMap[view.id]} onRun={(manifest) => navigate({ page: "run", manifest })} onBack={goHome} />}{view.page === "classroom" && <ClassroomPage onRun={(manifest) => navigate({ page: "run", manifest })} />}{view.page === "run" && <RunPage manifest={view.manifest} onComplete={(bundle) => { setLastResult(bundle); window.location.hash = "#/results"; }} onExit={goHome} />}{view.page === "import" && <ImportPage />}{view.page === "results" && <ResultsPage bundle={view.bundle ?? lastResult} onHome={goHome} />}{view.page === "home" && <footer className="footer">PsyLab 首个公开版本</footer>}</main>
  </div>;
}

const experimentCategories: Record<string, string> = {
  "simple-rt": "反应速度",
  "choice-rt": "反应与选择",
  "stroop-color-word": "冲突与注意",
  flanker: "冲突与注意",
  simon: "冲突与注意",
  "go-no-go": "反应抑制",
  "visual-search": "注意与搜索",
  "mental-rotation": "空间与表象"
};

interface ResumeState {
  latest: ResultBundle | null;
  draft: { key: string; manifest: SessionManifest; trialCount: number } | null;
}

/** 欢迎横幅的关闭状态按“哪一次结果被关闭”持久化；完成新结果后会再次提示。 */
const HIDDEN_RESULT_KEY = "psylab-ui:hidden-latest-result";
function resultKey(bundle: ResultBundle): string { return `${bundle.session.sessionId}:${bundle.session.attemptId}`; }
function readHiddenResult(): string | null { try { return window.localStorage.getItem(HIDDEN_RESULT_KEY); } catch { return null; } }
function writeHiddenResult(value: string): void { try { window.localStorage.setItem(HIDDEN_RESULT_KEY, value); } catch { /* 存储不可用时退化为仅本次会话隐藏 */ } }

function HomePage({ onDetail, onClassroom, onResume, onResults }: { onDetail: (id: string) => void; onClassroom: () => void; onResume: (manifest: SessionManifest) => void; onResults: () => void }) {
  const visibleDefinitions = definitions.filter((definition) => validateDefinition(definition).valid && definition.runPolicy.publicCatalog);
  const [resume, setResume] = useState<ResumeState>({ latest: null, draft: null });
  const [hideLatest, setHideLatest] = useState(false);
  useEffect(() => {
    void Promise.all([loadLatestResult(), listDrafts()]).then(([latest, drafts]) => {
      // 多个草稿时提示最近创建的一次，避免横幅被旧会话淹没。
      const newest = drafts
        .map((entry) => ({ key: entry.key, manifest: entry.draft.manifest, trialCount: entry.draft.trials.length }))
        .sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt))[0];
      setResume({ latest, draft: newest ?? null });
      if (latest && readHiddenResult() === resultKey(latest)) setHideLatest(true);
    });
  }, []);
  const titleOf = (experimentId: string) => definitionMap[experimentId]?.metadata.title ?? experimentId;
  const discardDraft = () => { const key = resume.draft?.key; if (!key) return; void deleteDraft(key).then(() => setResume((value) => ({ ...value, draft: null }))); };
  const hideWelcomeBanner = () => { if (resume.latest) writeHiddenResult(resultKey(resume.latest)); setHideLatest(true); };
  return <div className="page">
    {resume.draft && <section className="resume-band draft"><div><strong>你有一个未完成的《{titleOf(resume.draft.manifest.experimentId)}》</strong><span>已在本浏览器记录 {resume.draft.trialCount} 个 trial；继续会从中断处接上，原始记录保留。</span></div><div className="resume-actions"><button className="primary" onClick={() => onResume(resume.draft!.manifest)}>继续任务 →</button><button className="text-button" onClick={discardDraft}>不再继续</button></div></section>}
    {!resume.draft && resume.latest && !hideLatest && <section className="resume-band"><div><strong>欢迎回来 · 上次你完成了《{titleOf(resume.latest.experiment.experimentId)}》</strong><span>结果只保存在完成实验的浏览器里；可以回看，也可以换一个现象继续观察。</span></div><div className="resume-actions"><button className="primary" onClick={onResults}>查看上次结果 →</button><button className="text-button" onClick={hideWelcomeBanner}>关闭</button></div></section>}
    <section className="hero"><div><p className="eyebrow">中文心理学实验平台 · 公开测试版</p><h1>把经典实验带进真实课堂<br /><em>也交给每一份好奇心</em></h1><p className="hero-copy">选一个经典心理实验，几分钟完成练习与正式试次，查看本次任务的描述性指标。不需要账号，数据不离开浏览器。</p><div className="hero-actions"><button className="primary" onClick={() => onDetail("simple-rt")}>开始一次体验 <span>→</span></button><button className="text-button" onClick={onClassroom}>为课堂创建会话</button></div></div></section>
    <section className="section-head"><div><p className="eyebrow">实验目录</p><h2>选择一个现象开始观察</h2></div><span className="muted">开放层 · beta</span></section><div className="experiment-grid">{visibleDefinitions.map((definition, index) => <ExperimentCard key={definition.experimentId} definition={definition} index={index} onClick={() => onDetail(definition.experimentId)} />)}</div>
    <section className="howto-strip" aria-label="使用方式"><div><span>1</span><strong>读说明，熟悉规则</strong><p>每个实验都有中文说明和练习阶段；随时可以退出，练习不进入摘要。</p></div><div><span>2</span><strong>完成练习与正式试次</strong><p>键盘作答，通常几分钟；中断会自动保存在本机，下次打开可继续。</p></div><div><span>3</span><strong>查看指标，带走结果</strong><p>结果只描述本次表现；可下载 JSON 结果包与 CSV 代码本，供课堂回收。</p></div></section>
    <section className="notice-band"><span className="notice-icon">i</span><div><strong>先读说明，再决定是否开始</strong><p>结果只描述这一次任务的表现，不是心理诊断或能力评估。你可以随时退出。</p></div></section></div>;
}

function ExperimentCard({ definition, index, onClick }: { definition: ExperimentDefinition; index: number; onClick: () => void }) {
  const accent = ["coral", "teal", "indigo", "amber"][index % 4];
  return <article className={`experiment-card ${accent}`} role="button" tabIndex={0} aria-label={`查看 ${definition.metadata.title}`} onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}><div className="card-top"><span className="number">0{index + 1}</span><span className="card-tag">{experimentCategories[definition.experimentId] ?? "开放实验"}</span><span className="status">{tierStatusLabel(definition.runPolicy.tier, definition.metadata.status)}</span></div><div className="card-art" aria-hidden="true">{definition.experimentId === "simple-rt" ? <><i /><i /><i /></> : definition.experimentId === "stroop-color-word" ? <span className="stroop-art">红</span> : definition.experimentId === "go-no-go" ? <><span className="go-art">●</span><span className="stop-art">■</span></> : definition.experimentId === "choice-rt" ? <span className="stroop-art">2·4</span> : definition.experimentId === "flanker" ? <><span className="go-art">←</span><span className="stop-art">→</span></> : definition.experimentId === "simon" ? <span className="rotate-art">●</span> : definition.experimentId === "visual-search" ? <><span className="go-art">◎</span><span className="stop-art">■</span></> : <span className="rotate-art">◆</span>}</div><h3>{definition.metadata.title}</h3><p>{definition.metadata.purpose}</p>{definition.metadata.publicMetric && <span className="card-metric">你将看到 · {definition.metadata.publicMetric.label}</span>}<div className="card-bottom"><span>{definition.metadata.durationMinutes.min}-{definition.metadata.durationMinutes.max} 分钟</span><span className="card-open" aria-hidden="true">查看详情 →</span></div></article>;
}

function responseKeysHint(experimentId: string): string {
  const hints: Record<string, string> = { "stroop-color-word": "红 F / 绿 J / 蓝 K", "mental-rotation": "同形 F / 镜像 J", "choice-rt": "按颜色对应按键", flanker: "左 F / 右 J", simon: "红 F / 绿 J", "visual-search": "找到 J / 没有 F" };
  return hints[experimentId] ?? "空格键";
}

function DetailPage({ definition, onRun, onBack }: { definition?: ExperimentDefinition; onRun: (manifest: SessionManifest) => void; onBack: () => void }) {
  const [creating, setCreating] = useState(false);
  if (!definition) return <EmptyState message="找不到这个实验定义" onBack={onBack} />;
  const start = async () => { setCreating(true); const config = defaultConfig(definition.experimentId); const hash = await sha256(config); onRun({ format: "psylab-session", formatVersion: "1.0", experimentId: definition.experimentId, definitionVersion: definition.definitionVersion, distributionTier: definition.runPolicy.tier, runPolicyVersion: definition.runPolicy.version, config, configHash: hash, sessionId: makeId("session"), createdAt: new Date().toISOString() }); };
  const narrowViewport = typeof window !== "undefined" && window.innerWidth < 800;
  return <div className="page narrow"><button className="back-link" onClick={onBack}>← 返回实验馆</button>{narrowViewport && <div className="mobile-notice">当前窗口宽度不足 800px，环境预检会阻止运行。请改用桌面 Chrome/Edge，并把窗口最大化后再开始。</div>}<div className="detail-hero"><div><span className="status-pill">{tierStatusLabel(definition.runPolicy.tier, definition.metadata.status)}</span><h1>{definition.metadata.title}</h1><p className="lead">{definition.metadata.purpose}</p></div><div className="detail-symbol">{definition.experimentId === "mental-rotation" ? "◆" : definition.experimentId === "go-no-go" ? "●" : definition.experimentId === "stroop-color-word" ? "红" : definition.experimentId === "flanker" ? "→" : definition.experimentId === "visual-search" ? "◎" : "●"}</div></div><div className="detail-grid"><section className="content-section"><h2>你将观察什么</h2><p>{definition.metadata.purpose} 任务通过固定的程序化刺激和随机种子生成试次，完成后展示条件内的描述性统计。</p><h2>理论与设计</h2><p>{definition.metadata.theoryBackground}</p><dl className="variable-list"><div><dt>设计</dt><dd>{definition.metadata.design}</dd></div><div><dt>自变量</dt><dd>{definition.metadata.independentVariables.join("；")}</dd></div><div><dt>因变量</dt><dd>{definition.metadata.dependentVariables.join("；")}</dd></div></dl><h2>开始前知道</h2><ul className="check-list"><li>使用桌面 Chrome 或 Edge，建议连接实体键盘。</li><li>浏览器会保存断点；清理站点数据可能导致未导出结果丢失。</li><li>反应时受设备和浏览器影响，不用于跨设备排名。</li><li>不需要填写姓名、学号或其他真实身份信息。</li></ul><div className="method-box"><span>方法</span><p>练习阶段带逐次对错反馈，不进入正式摘要。正式 trial 保留原始响应与排除原因，指标规则版本随结果导出。</p></div></section><aside className="start-panel"><div><span className="panel-kicker">预计用时</span><strong>{definition.metadata.durationMinutes.min}-{definition.metadata.durationMinutes.max} 分钟</strong></div><div><span className="panel-kicker">按键</span><strong>{responseKeysHint(definition.experimentId)}</strong></div><button className="primary full" onClick={start} disabled={creating}>{creating ? "正在准备…" : "开始实验 →"}</button><p className="small">开始即表示你已阅读说明。你可以在任何阶段退出。</p></aside></div></div>;
}

function ClassroomPage({ onRun }: { onRun: (manifest: SessionManifest) => void }) {
  const [id, setId] = useState(definitions[0].experimentId); const definition = definitionMap[id]; const [config, setConfig] = useState(defaultConfig(id)); const [teacherAck, setTeacherAck] = useState(false); const [manifest, setManifest] = useState<SessionManifest | null>(null); const [error, setError] = useState(""); const [linkCopied, setLinkCopied] = useState(false);
  useEffect(() => { setConfig(defaultConfig(id)); setTeacherAck(false); setManifest(null); }, [id]);
  const update = (key: string, value: string) => setConfig((current) => ({ ...current, [key]: Number(value) }));
  const create = async (event: FormEvent) => { event.preventDefault(); setError(""); if (definition.runPolicy.requiresTeacherAcknowledgement && !teacherAck) { setError("此发布层级需要教师确认告知、材料和事后解释安排。"); return; } const check = validateConfig(definition, config); if (!check.valid) { setError(check.errors.join("；")); return; } const hash = await sha256(config); const next: SessionManifest = { format: "psylab-session", formatVersion: "1.0", experimentId: id, definitionVersion: definition.definitionVersion, distributionTier: definition.runPolicy.tier, runPolicyVersion: definition.runPolicy.version, config: { ...config, teacherAcknowledged: teacherAck }, configHash: hash, sessionId: makeId("class"), createdAt: new Date().toISOString() }; setManifest(next); };
  const sessionLink = manifest ? `${window.location.origin}${window.location.pathname}#/run/${encodeJson(manifest)}` : "";
  const copyLink = async () => { try { await navigator.clipboard.writeText(sessionLink); setLinkCopied(true); window.setTimeout(() => setLinkCopied(false), 2000); } catch { /* 非安全上下文或剪贴板权限被拒时，仍可手动选择链接复制。 */ } };
  return <div className="page narrow"><div className="section-head"><div><p className="eyebrow">课堂模式</p><h1>创建一个可复现会话</h1><p className="lead">生成会话配置后，把链接或 `.psylab-session.json` 文件交给学生。结果通过本地文件回收。</p></div></div><form className="classroom-form" onSubmit={create}><label>实验<select value={id} onChange={(event) => setId(event.target.value)}>{definitions.map((item) => <option key={item.experimentId} value={item.experimentId}>{item.metadata.title}</option>)}</select></label><div className="form-row"><label>练习 trial<input type="number" min={2} value={Number(config.practiceTrials)} onChange={(event) => update("practiceTrials", event.target.value)} /></label><label>正式 trial<input type="number" min={8} value={Number(config.testTrials)} onChange={(event) => update("testTrials", event.target.value)} /></label>{id === "go-no-go" && <label>Go 比例<input type="number" min={0.4} max={0.8} step={0.05} value={Number(config.goRatio)} onChange={(event) => update("goRatio", event.target.value)} /></label>}</div>{definition.runPolicy.requiresTeacherAcknowledgement && <label className="consent-box"><input type="checkbox" checked={teacherAck} onChange={(event) => setTeacherAck(event.target.checked)} />我已确认本会话的扩展告知、材料条件和不可跳过的事后解释安排。</label>}{error && <div className="error-box">{error}</div>}<button className="primary" type="submit">生成会话配置</button></form>{manifest && <div className="manifest-box"><div className="manifest-head"><span className="status-pill">配置已生成</span><button className="text-button" onClick={() => downloadText(`${manifest.sessionId}.psylab-session.json`, JSON.stringify(manifest, null, 2), "application/json;charset=utf-8")}>下载会话文件</button></div><p>配置哈希：<code>{manifest.configHash}</code></p><p>学生打开下方链接后在自己的浏览器填写匿名参与者代码；该代码不会写入会话链接。</p><code className="session-link">{sessionLink}</code><div className="manifest-actions"><button className="text-button" onClick={() => void copyLink()}>{linkCopied ? "已复制 ✓" : "复制链接"}</button><button className="primary" onClick={() => onRun(manifest)}>在此浏览器预览运行 →</button></div></div>}</div>;
}

type RunStage = "checking" | "instructions" | "practice" | "transition" | "test" | "debrief" | "exit";

function RunPage({ manifest, onComplete, onExit }: { manifest: SessionManifest; onComplete: (bundle: ResultBundle) => void; onExit: () => void }) {
  const definition = definitionMap[manifest.experimentId]; const runConfig = useMemo(() => experimentConfig(manifest.config), [manifest.config]); const plans = useMemo(() => generateTrials(manifest.experimentId, runConfig, `${manifest.sessionId}:${manifest.configHash}`), [manifest.experimentId, runConfig, manifest.sessionId, manifest.configHash]); const jsPsychTimeline = useMemo(() => compileTimeline(plans), [plans]);
  const [stage, setStage] = useState<RunStage>("checking");
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof runPreflight>> | null>(null);
  const [recheckNonce, setRecheckNonce] = useState(0);
  const [manifestError, setManifestError] = useState(""); const [runnerError, setRunnerError] = useState("");
  const [index, setIndex] = useState(0); const [trials, setTrials] = useState<TrialRecord[]>([]); const trialsRef = useRef<TrialRecord[]>([]);
  const [focusLossCount, setFocusLossCount] = useState(0); const [focusLossTotal, setFocusLossTotal] = useState(0); const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [participantCode, setParticipantCode] = useState(""); const [attemptId, setAttemptId] = useState(() => makeId("attempt"));
  const [result, setResult] = useState<ResultBundle | null>(null); const [ack, setAck] = useState(false);
  const draftKey = `draft:${manifest.sessionId}`;
  const taskGuide = taskGuides[manifest.experimentId] ?? taskGuides["simple-rt"]; const runnerTone = `runner-${manifest.experimentId}`;
  const practiceCount = Number(manifest.config.practiceTrials);
  const codeInvalid = participantCode.length > 0 && !participantCodePattern.test(participantCode);
  useEffect(() => { setChecks(null); void Promise.all([runPreflight(definition), createJsPsychRuntime(jsPsychTimeline).then(() => null).catch((error: unknown) => error instanceof Error ? error.message : "无法初始化")]).then(([preflight, jsPsychError]) => setChecks({ ...preflight, checks: [...preflight.checks, { id: "jspsych", label: "jsPsych 时间线", ok: !jsPsychError, detail: jsPsychError ? `初始化失败：${jsPsychError}` : "已在当前浏览器编译并验证时间线" }] })); }, [definition, jsPsychTimeline, recheckNonce]);
  useEffect(() => { void validateRunManifest(manifest, definition).then((errors) => setManifestError(errors.join("；"))); }, [definition, manifest]);
  useEffect(() => { const handler = () => { if (document.visibilityState === "hidden") { setFocusLossCount((value) => value + 1); setFocusLossTotal((value) => value + 1); } }; document.addEventListener("visibilitychange", handler); return () => document.removeEventListener("visibilitychange", handler); }, []);
  useEffect(() => { const handler = () => { if ((stage === "practice" || stage === "test" || stage === "transition") && !document.fullscreenElement) setFullscreenExitCount((value) => value + 1); }; document.addEventListener("fullscreenchange", handler); return () => document.removeEventListener("fullscreenchange", handler); }, [stage]);
  const persistDraft = (nextTrials: TrialRecord[]) => { void saveDraft(draftKey, { manifest, participantCode, attemptId, randomSeed: `${manifest.sessionId}:${manifest.configHash}`, trials: nextTrials, focusLossCount: 0, focusLossTotal, fullscreenExitCount, storageRecoveryUsed }); };
  useEffect(() => { void loadDraft(draftKey).then(async (draft) => { if (!draft || !draft.trials.length || draft.manifest.configHash !== manifest.configHash) return; trialsRef.current = draft.trials; setTrials(draft.trials); setParticipantCode(draft.participantCode || ""); setAttemptId(draft.attemptId || makeId("attempt")); setFocusLossCount(0); setFocusLossTotal(draft.focusLossTotal ?? draft.focusLossCount); setFullscreenExitCount(draft.fullscreenExitCount ?? 0); setIndex(draft.trials.length); if (draft.trials.length < practiceCount) { setStage("practice"); return; } if (draft.trials.length < plans.length) { setStage("test"); return; } setStage("debrief"); const saved = await loadLatestResult(); if (saved?.session.sessionId === manifest.sessionId && saved.session.attemptId === draft.attemptId) { setResult(saved); return; } if (!definition) return; const restored = buildResultBundle({ definition, manifest, participantCode: draft.participantCode, attemptId: draft.attemptId, randomSeed: draft.randomSeed, environment: { browserFamily: browserFamily(), platformFamily: platformFamily(), viewportBucket: viewportBucket(), inputMode: "keyboard" }, focusLossCount: draft.focusLossTotal ?? draft.focusLossCount, fullscreenExitCount: draft.fullscreenExitCount ?? 0, storageRecoveryUsed: draft.storageRecoveryUsed, trials: draft.trials, completed: true, exportedAt: new Date().toISOString() }); setResult(restored); void saveResult(restored); }); }, [draftKey, manifest, manifest.configHash, plans.length, practiceCount, definition]);
  const storageRecoveryUsed = checks?.checks.some((check) => check.id === "storage" && !check.ok) ?? false;
  const canContinueFromPreflight = checks?.canStart === true && checks.checks.every((check) => check.id !== "jspsych" || check.ok);
  const finish = (newTrials: TrialRecord[]) => { if (!definition) return; const participant = participantCode.trim() || makeId("anon"); setParticipantCode(participant); trialsRef.current = newTrials; setTrials(newTrials); setIndex(plans.length); const bundle = buildResultBundle({ definition, manifest, participantCode: participant, attemptId, randomSeed: `${manifest.sessionId}:${manifest.configHash}`, environment: { browserFamily: browserFamily(), platformFamily: platformFamily(), viewportBucket: viewportBucket(), inputMode: "keyboard" }, focusLossCount: focusLossTotal, fullscreenExitCount, storageRecoveryUsed, trials: newTrials, completed: true, exportedAt: new Date().toISOString() }); setResult(bundle); setStage("debrief"); void saveDraft(draftKey, { manifest, participantCode: bundle.session.participantCode, attemptId: bundle.session.attemptId, randomSeed: bundle.session.randomSeed, trials: newTrials, focusLossCount: 0, focusLossTotal, fullscreenExitCount, storageRecoveryUsed }); void saveResult(bundle); };
  const saveInterrupted = async () => { if (!definition || !trials.length) return; const participant = participantCode.trim() || makeId("anon"); const bundle = buildResultBundle({ definition, manifest, participantCode: participant, attemptId, randomSeed: `${manifest.sessionId}:${manifest.configHash}`, environment: { browserFamily: browserFamily(), platformFamily: platformFamily(), viewportBucket: viewportBucket(), inputMode: "keyboard" }, focusLossCount: focusLossTotal, fullscreenExitCount, storageRecoveryUsed, trials, completed: false, exportedAt: new Date().toISOString() }); await saveResult(bundle); await deleteDraft(draftKey); await exitFullscreen(); onComplete(bundle); };
  const requestExit = () => { if ((stage === "practice" || stage === "test") && trials.length) setStage("exit"); else { void exitFullscreen(); onExit(); } };
  const discardAndExit = async () => { await deleteDraft(draftKey); await exitFullscreen(); onExit(); };
  // 注意：不要在单个 trial 完成时更新 startIndex；那会让 JsPsychStage 逐试次重建 jsPsych
  // 运行时，并在同一显示容器中堆积内容节点（页面高度随按键增长的已修复缺陷）。
  const handleJsPsychTrial = (trial: TrialRecord) => { trialsRef.current = [...trialsRef.current, trial]; setTrials(trialsRef.current); setFocusLossCount(0); persistDraft(trialsRef.current); };
  const handleJsPsychComplete = (completedTrials: TrialRecord[]) => {
    setRunnerError(""); trialsRef.current = completedTrials; setTrials(completedTrials); setFocusLossCount(0); persistDraft(completedTrials);
    if (stage === "practice") { setStage("transition"); return; }
    finish(completedTrials);
  };
  const restartPractice = () => { const withoutPractice = trialsRef.current.filter((trial) => trial.phase !== "practice"); trialsRef.current = withoutPractice; setTrials(withoutPractice); setIndex(0); persistDraft(withoutPractice); setStage("practice"); };
  const beginTest = () => { setIndex(practiceCount); setStage("test"); };
  const handleJsPsychError = (message: string) => setRunnerError(message);
  useEffect(() => () => { void exitFullscreen(); }, []);
  if (!definition) return <EmptyState message="实验定义不可用" onBack={onExit} />;
  if (manifestError) return <EmptyState message={manifestError} onBack={onExit} />;
  if (stage === "checking") return <div className={`runner-page ${runnerTone}`}><div className="runner-card"><div className={checks ? "preflight-complete" : "loader"}>{checks ? "✓" : ""}</div><h1>{checks ? "环境已就绪" : "正在检查浏览器环境"}</h1>{checks ? <><div className="check-list">{checks.checks.map((check) => <div className={`check-row ${check.ok ? "ok" : "warn"}`} key={check.id}><span>{check.ok ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div><div className="checking-actions"><button className="primary" disabled={!canContinueFromPreflight} onClick={() => setStage("instructions")}>继续阅读说明 →</button><button className="text-button" onClick={() => setRecheckNonce((value) => value + 1)}>重新检查</button></div>{!canContinueFromPreflight && <p className="small">请解决标记的问题后重新检查；本地存储不可用时可继续，但刷新不会恢复进度。</p>}</> : <p>请稍候…</p>}</div></div>;
  if (stage === "instructions") return <div className={`runner-page ${runnerTone}`}><div className="runner-card instruction-card"><span className="status-pill">{tierStatusLabel(definition.runPolicy.tier, definition.metadata.status)}</span><h1>开始前，请先了解任务</h1><p className="lead">{definition.metadata.purpose}</p><section className="task-guide"><h2>{taskGuide.focus}</h2><p>{taskGuide.sequence}</p><div className="guide-rule"><span>怎么作答</span><strong>{taskGuide.response}</strong></div><div className="guide-rule"><span>画面提示</span><strong>{taskGuide.visual}</strong></div></section><div className="instruction-grid"><div><span>实验阶段</span><strong>{practiceCount} 次练习 + {Number(manifest.config.testTrials)} 次正式</strong></div><div><span>本次设计</span><strong>{definition.metadata.design}</strong></div></div>{["stroop-color-word", "choice-rt", "simon", "visual-search"].includes(definition.experimentId) && <p className="small color-warning">色觉提示：本任务以颜色作答；如无法可靠辨别颜色，请退出且不要解读本次数据。</p>}<label className="participant-field">匿名参与者代码（可选）<input value={participantCode} maxLength={24} onChange={(event) => setParticipantCode(event.target.value)} placeholder="不填写将自动生成" autoComplete="off" />{codeInvalid ? <small className="field-error">仅支持字母、数字、下划线和连字符，不超过 24 个字符。</small> : <small>不填写会生成匿名编号；请勿填写姓名、学号、手机号或邮箱。</small>}</label>{definition.runPolicy.requiresTeacherAcknowledgement && <div className="consent-box"><label><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />我已阅读任务说明，知道练习不进入正式摘要，也知道可以随时退出。</label></div>}<div className="runner-actions"><button className="text-button" onClick={() => { void exitFullscreen(); onExit(); }}>退出</button><button className="primary" disabled={(definition.runPolicy.requiresTeacherAcknowledgement && !ack) || codeInvalid} onClick={async () => { const code = participantCode.trim() || makeId("anon"); setRunnerError(""); setParticipantCode(code); await enterFullscreen(); setIndex(0); setStage("practice"); }}>开始练习 →</button></div><p className="small instruction-note">练习阶段会显示每次作答的对错反馈；正式阶段不再提示。</p></div></div>;
  if (stage === "transition") { const practiceTrials = trials.filter((trial) => trial.phase === "practice"); const correctCount = practiceTrials.filter((trial) => trial.correct === true).length; const accuracy = practiceTrials.length ? Math.round((correctCount / practiceTrials.length) * 100) : null; return <div className={`runner-page ${runnerTone}`}><div className="runner-card"><span className="status-pill">练习完成</span><h1>准备好进入正式测试了吗？</h1><p className="lead">练习结果不会进入正式摘要。正式阶段不再显示对错提示，请按练习时同样的规则作答。</p><div className="practice-summary"><div><span>练习试次</span><strong>{practiceTrials.length}</strong></div><div><span>正确</span><strong>{correctCount}</strong></div><div><span>正确率</span><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong></div></div><div className="runner-actions"><button className="text-button" onClick={() => { void exitFullscreen(); onExit(); }}>退出</button><button className="text-button" onClick={restartPractice}>再练一次</button><button className="primary" onClick={beginTest}>开始正式测试 →</button></div></div></div>; }
  if (stage === "debrief") return <div className={`runner-page ${runnerTone}`}><div className="runner-card"><span className="status-pill">任务完成</span><h1>{definition.runPolicy.requiresDebrief ? "先完成事后说明" : "你的结果已准备好"}</h1><p className="lead">{definition.runPolicy.requiresDebrief ? "这一步用于解释实验现象和局限，阅读后才能查看结果。" : "原始 trial、指标版本和质量标记已保存在当前浏览器。"}</p>{definition.runPolicy.requiresDebrief && <div className="method-box"><p>条件差异是本次任务中的描述性现象，不代表稳定的个人特征；设备和输入延迟可能影响反应时。</p></div>}<div className="runner-actions"><button className="text-button" onClick={() => { void exitFullscreen(); onExit(); }}>稍后处理</button><button className="primary" onClick={async () => { if (result) { const completed = definition.runPolicy.requiresDebrief ? { ...result, quality: { ...result.quality, flags: [...(result.quality.flags ?? []), "debrief-completed"] } } : result; await saveResult(completed); await deleteDraft(draftKey); await exitFullscreen(); onComplete(completed); } }}>查看结果 →</button></div></div></div>;
  if (stage === "exit") return <div className={`runner-page ${runnerTone}`}><div className="runner-card"><span className="status-pill">已保存 {trials.length} 个 trial</span><h1>结束本次任务？</h1><p className="lead">你可以保存一份标记为“中途退出”的结果，之后由教师单独处理；也可以保留草稿继续完成。</p><div className="method-box"><p>中断结果会保留原始 trial、质量标记和排除原因，但不会被当作完整任务摘要。</p></div><div className="runner-actions"><button className="text-button" onClick={() => setStage(trials.length < practiceCount ? "practice" : "test")}>继续任务</button><button className="text-button" onClick={() => void discardAndExit()}>放弃草稿</button><button className="primary" onClick={() => void saveInterrupted()}>保存中断结果</button></div></div></div>;
  if (runnerError && (stage === "practice" || stage === "test")) return <div className={`runner-page ${runnerTone}`}><div className="runner-card runner-error"><span className="status-pill">实验未能继续</span><h1>运行时出现问题</h1><p className="lead">{runnerError}</p><p className="small">已记录的 trial 会保留在本地草稿中；退出后可以重新打开本次会话继续。</p><div className="runner-actions"><button className="primary" onClick={() => { setRunnerError(""); onExit(); }}>返回体验馆</button></div></div></div>;
  if (stage === "practice" || stage === "test") return <JsPsychStage experimentId={manifest.experimentId} stage={stage} plans={plans} startIndex={index} focusLossCount={focusLossCount} baseTrials={trials} onTrial={handleJsPsychTrial} onComplete={handleJsPsychComplete} onError={handleJsPsychError} onExit={requestExit} />;
  return null;
}

function formatMetricValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "暂无";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}${unit === "ms" ? " ms" : unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
}

function formatTimestamp(iso: string): string { const date = new Date(iso); return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("zh-CN", { hour12: false }); }

/** 结果页与教师导入列表共用的公众主指标读法（含 invert100 变换）。 */
function publicMetricView(definition: ExperimentDefinition, metrics: MetricsResult) {
  const publicMetric = definition.metadata.publicMetric;
  if (!publicMetric) return null;
  const metric = definition.metrics.find((item) => item.id === publicMetric.id);
  const raw = metrics.cleaned[publicMetric.id] ?? null;
  const value = raw === null ? null : publicMetric.transform === "invert100" ? 100 - raw : raw;
  return { publicMetric, metric, value };
}

function ResultsPage({ bundle, onHome }: { bundle: ResultBundle | null; onHome: () => void }) {
  if (!bundle) return <EmptyState message="没有可显示的结果。结果默认只保存在完成实验的浏览器中。" onBack={onHome} />;
  const definition = definitionMap[bundle.experiment.experimentId];
  if (!definition) return <EmptyState message="结果引用了当前站点没有的实验 Definition，已阻止继续解读。" onBack={onHome} />;
  if (!hasCompletedRequiredDebrief(bundle, definition)) return <EmptyState message="该引导层任务尚未完成事后说明，不能显示或导出结果。请返回原会话完成 debrief。" onBack={onHome} />;
  const metrics = calculateMetrics(bundle.experiment.experimentId, bundle.trials);
  const publicView = publicMetricView(definition, metrics);
  const qualityFlags = (bundle.quality.flags ?? []).filter((flag) => flag !== "interrupted");
  const effectiveTrials = bundle.trials.filter((trial) => !trial.excluded && trial.phase === "test").length;
  // 课堂会话由 ClassroomPage 用 makeId("class") 创建；据此切换“交给老师”与“自行留存”两种指引文案。
  const isClassroomResult = bundle.session.sessionId.startsWith("class-");
  return <div className="page narrow result-page"><div className="result-header"><span className="status-pill">{tierStatusLabel(bundle.experiment.distributionTier, definition.metadata.status)}</span><h1>这是本次任务的结果</h1><p className="lead">先看一个容易理解的任务指标；详细数据、清洗规则和版本信息在下方。</p></div>{publicView && <section className="public-result-card"><div><span className="section-kicker">大众读法</span><h2>{publicView.publicMetric.label}</h2><p>{publicView.publicMetric.description}</p></div><div className="public-result-value"><strong>{formatMetricValue(publicView.value, publicView.metric?.unit ?? "")}</strong><span>{publicView.publicMetric.interpretation}</span></div></section>}<div className="quality-panel"><div><strong>数据质量</strong><span>{bundle.quality.completed ? "已完成" : "中途退出"} · {effectiveTrials} 个有效正式 trial</span></div><div className="quality-flags">{qualityFlags.length ? qualityFlags.map((flag) => <span key={flag}>{qualityFlagLabels[flag] ?? flag}</span>) : <span className="good">未发现额外标记</span>}</div></div><div className="session-echo"><div><span>匿名参与者代码</span><strong>{bundle.session.participantCode}</strong></div><div><span>会话</span><strong>{bundle.session.sessionId}</strong></div><div><span>完成时间</span><strong>{formatTimestamp(bundle.exportedAt)}</strong></div><div><span>运行环境</span><strong>{bundle.environment.browserFamily} · {bundle.environment.platformFamily} · {viewportBucketLabels[bundle.environment.viewportBucket] ?? bundle.environment.viewportBucket}</strong></div></div><section className="result-detail-section"><div className="section-title"><div><span className="section-kicker">详细指标</span><h2>按条件查看</h2></div><p>正确率使用全部正式 trial；反应时只使用通过清洗规则的有效 trial。</p></div><div className="condition-table-wrap"><table className="condition-table"><thead><tr><th>条件</th><th>正式 trial</th><th>正确率</th><th>中位数 RT</th></tr></thead><tbody>{Object.entries(metrics.byCondition).map(([condition, value]) => <tr key={condition}><th scope="row">{conditionLabel(bundle.experiment.experimentId, condition)}</th><td>{value.n}</td><td>{value.accuracy === null ? "暂无" : `${Math.round(value.accuracy * 100) / 100}%`}</td><td>{formatMetricValue(value.medianRtMs, "ms")}</td></tr>)}</tbody></table></div><div className="metric-grid compact">{Object.entries(metrics.cleaned).map(([key, value]) => { const metric = definition.metrics.find((item) => item.id === key); return <div className="metric-card" key={key}><span>{metric?.label ?? key}</span><strong>{formatMetricValue(value, metric?.unit ?? "")}</strong><small>{metric?.description ?? "描述性指标"}</small></div>; })}</div></section><details className="method-details"><summary>查看方法、版本和限制</summary><p>{definition.metadata.theoryBackground}</p><p>{definition.metadata.limitations?.join(" ")}</p><p>实验版本 {bundle.experiment.definitionVersion} · 指标规则 {bundle.experiment.metricsVersion} · 配置哈希 <code>{bundle.experiment.configHash}</code></p></details>
      <div className="submit-guide"><strong>{isClassroomResult ? "如何交回这份结果？" : "想保留这份数据？"}</strong><p>{isClassroomResult ? "点击下方主按钮会下载 1 个 .json 文件；请不要改名或编辑内容，按老师要求提交即可。教师重新导入时会自动生成 CSV 和代码本，你不需要额外导出。" : "结果目前只保存在这台设备的浏览器中；想留存或转移，请下载结果文件。"}</p><code>{resultJsonFilename(bundle)}</code></div>
      <section className="result-actions"><button className="primary" onClick={() => downloadJson(bundle)}>下载结果文件（JSON）</button><button className="text-button" onClick={() => downloadCsvFiles(bundle, metrics, definition)}>导出 CSV 与代码本</button><button className="text-button" onClick={onHome}>返回体验馆</button></section></div>;
}

function ImportPage() {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState<SessionManifest | null>(null);
  const [sessionFileName, setSessionFileName] = useState("");
  const [resultFiles, setResultFiles] = useState<File[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  // webkitdirectory 不在 React 类型定义中；用 ref 显式挂载，避免 any 断言。
  const folderInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { folderInputRef.current?.setAttribute("webkitdirectory", ""); folderInputRef.current?.setAttribute("directory", ""); }, []);
  const runImport = async (files: File[], activeManifest: SessionManifest | null) => {
    setBusy(true);
    setReport(await importResultFiles(files, activeManifest ? { experimentId: activeManifest.experimentId, definitionVersion: activeManifest.definitionVersion, runPolicyVersion: activeManifest.runPolicyVersion, configHash: activeManifest.configHash, distributionTier: activeManifest.distributionTier } : undefined));
    setBusy(false);
  };
  // 单一入口：会话文件与结果文件按 format 自动识别，与拖入顺序无关——
  // 后识别到的会话会用已载入的结果自动重跑，启用 configHash 与试次结构强校验。
  const loadSelection = async (fileList: File[]) => {
    const jsonFiles = fileList.filter((file) => file.name.toLowerCase().endsWith(".json"));
    if (!jsonFiles.length) return;
    const errors: string[] = [];
    let nextManifest = manifest;
    let nextSessionName = sessionFileName;
    const incoming: File[] = [];
    for (const file of jsonFiles) {
      try {
        const value = await readJsonFile(file) as { format?: string } | null;
        if (value?.format === "psylab-session") {
          const validation = validateSession(value);
          if (validation.valid && validation.value) { nextManifest = validation.value; nextSessionName = file.name; }
          else errors.push(`${file.name}：会话文件无效（${validation.errors.join("；")}）`);
        } else if (value?.format === "psylab-result") incoming.push(file);
        else errors.push(`${file.name}：不是 PsyLab 会话或结果文件`);
      } catch { errors.push(`${file.name}：无法解析 JSON`); }
    }
    setLoadErrors(errors);
    setManifest(nextManifest);
    setSessionFileName(nextSessionName);
    const merged = incoming.length ? [...resultFiles, ...incoming.filter((file) => !resultFiles.some((existing) => existing.name === file.name && existing.size === file.size))] : resultFiles;
    if (incoming.length) setResultFiles(merged);
    if (merged.length) await runImport(merged, nextManifest);
  };
  const clearSession = async () => { setManifest(null); setSessionFileName(""); if (resultFiles.length) await runImport(resultFiles, null); };
  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) await loadSelection([...event.target.files]); };
  const onDrop = async (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragActive(false); await loadSelection([...event.dataTransfer.files]); };
  const codebookDefinition = manifest ? definitionMap[manifest.experimentId] : report?.accepted[0] ? definitionMap[report.accepted[0].experiment.experimentId] : undefined;
  return <div className="page narrow"><div className="section-head"><div><p className="eyebrow">教师工具</p><h1>本地批量导入</h1><p className="lead">把课堂会话文件（`.psylab-session.json`）和学生的结果 JSON 一起拖进来即可：会话用于校验配置一致性与试次结构，导入器还会拦截不自洽的篡改。所有校验、去重和导出均在本地完成。</p></div></div>{(manifest || resultFiles.length > 0 || loadErrors.length > 0) && <div className="import-status">{manifest && <div className="status-chip session"><span>已识别课堂会话</span><strong>{manifest.experimentId} · {manifest.configHash.slice(0, 20)}…</strong><small>来自 {sessionFileName}</small><button className="text-button" onClick={() => void clearSession()}>移除</button></div>}{resultFiles.length > 0 && <div className="status-chip"><span>已载入结果文件</span><strong>{resultFiles.length} 个</strong></div>}{loadErrors.map((message) => <div className="error-box" key={message}>{message}</div>)}</div>}<div className={`drop-zone${dragActive ? " dragover" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { void onDrop(event); }}><span className="upload-icon">↑</span><strong>拖拽或选择会话与结果 JSON</strong><p>可以混在一起一次拖入；非 JSON 文件会被忽略，单文件不超过 5 MB。混合实验、版本、配置不一致、重复提交和不自洽的篡改都会被拦下。</p><div className="drop-actions"><label className="primary file-button">{busy ? "正在检查…" : "选择文件"}<input type="file" accept="application/json,.json" multiple onChange={onFiles} disabled={busy} /></label><label className="text-button file-button">选择整个文件夹<input ref={folderInputRef} type="file" onChange={onFiles} disabled={busy} /></label></div></div>{report && <section className="import-report"><div className="report-summary"><div><b>{report.accepted.length}</b><span>个文件通过</span></div><div className={report.errors.length ? "bad" : ""}><b>{report.errors.length}</b><span>个错误</span></div><div><b>{report.warnings.length}</b><span>个提醒</span></div></div>{report.accepted.length > 0 && <div className="result-actions"><button className="primary" onClick={() => downloadText("psylab-batch-trials.csv", batchTrialsCsv(report.accepted), "text/csv;charset=utf-8")}>下载批量 trial CSV</button><button className="text-button" onClick={() => downloadText("psylab-batch-summary.csv", batchSummaryCsv(report.accepted), "text/csv;charset=utf-8")}>下载参与者摘要 CSV</button>{codebookDefinition && <button className="text-button" onClick={() => downloadText(`psylab-codebook-${codebookDefinition.experimentId}.csv`, codebookCsv(codebookDefinition), "text/csv;charset=utf-8")}>下载代码本</button>}</div>}{report.accepted.length > 0 && <div className="bundle-list"><p className="small">点击参与者可在浏览器中查看明细，无需下载：</p>{report.accepted.map((bundle) => <BundleRow bundle={bundle} key={`${bundle.session.sessionId}:${bundle.session.participantCode}:${bundle.session.attemptId}`} />)}</div>}{report.errors.length > 0 && <button className="text-button" onClick={() => downloadText("psylab-import-errors.csv", errorReportCsv(report), "text/csv;charset=utf-8")}>下载错误报告</button>}<div className="report-list">{report.errors.map((error) => <div className="report-row error" key={`${error.file}-${error.reasons.join()}`}><strong>{error.file}</strong><span>{error.reasons.join("；")}</span></div>)}{report.warnings.map((warning) => <div className="report-row warning" key={`${warning.file}-${warning.reasons.join()}`}><strong>{warning.file}</strong><span>{warning.reasons.join("；")}</span></div>)}</div></section>}</div>;
}

/** 教师导入页的参与者明细：主行一眼看全，展开后可核对条件级统计与环境。 */
function BundleRow({ bundle }: { bundle: ResultBundle }) {
  const definition = definitionMap[bundle.experiment.experimentId];
  const metrics = calculateMetrics(bundle.experiment.experimentId, bundle.trials);
  const publicView = definition ? publicMetricView(definition, metrics) : null;
  const testCount = bundle.trials.filter((trial) => trial.phase === "test").length;
  const flags = (bundle.quality.flags ?? []).filter((flag) => flag !== "interrupted");
  return <details className="bundle-row"><summary><strong>{bundle.session.participantCode}</strong><span className={`status-pill ${bundle.quality.completed ? "" : "warn"}`}>{bundle.quality.completed ? "已完成" : "中途退出"}</span><span className="bundle-count">{testCount} 正式 trial</span>{publicView && <span className="bundle-metric">{publicView.publicMetric.label} {formatMetricValue(publicView.value, publicView.metric?.unit ?? "")}</span>}{flags.length > 0 && <span className="bundle-flags">{flags.map((flag) => qualityFlagLabels[flag] ?? flag).join(" · ")}</span>}</summary><div className="bundle-detail"><table className="condition-table"><thead><tr><th>条件</th><th>正式 trial</th><th>正确率</th><th>中位数 RT</th></tr></thead><tbody>{Object.entries(metrics.byCondition).map(([condition, value]) => <tr key={condition}><th scope="row">{conditionLabel(bundle.experiment.experimentId, condition)}</th><td>{value.n}</td><td>{value.accuracy === null ? "暂无" : `${Math.round(value.accuracy * 100) / 100}%`}</td><td>{formatMetricValue(value.medianRtMs, "ms")}</td></tr>)}</tbody></table><div className="bundle-meta"><span>尝试 {bundle.session.attemptId}</span><span>完成时间 {formatTimestamp(bundle.exportedAt)}</span><span>环境 {bundle.environment.browserFamily} · {bundle.environment.platformFamily} · {viewportBucketLabels[bundle.environment.viewportBucket] ?? bundle.environment.viewportBucket}</span><span>失焦 {bundle.quality.focusLossCount} 次 · 排除 {metrics.excluded.length} 个 trial</span></div></div></details>;
}

function EmptyState({ message, onBack }: { message: string; onBack: () => void }) { return <div className="page empty-state"><h1>{message}</h1><button className="primary" onClick={onBack}>返回体验馆</button></div>; }
