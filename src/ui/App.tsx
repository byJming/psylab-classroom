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
import { presentationFor } from "./experimentPresentation";
import { ExperimentPreview } from "./ExperimentPreview";

type View = { page: "home" } | { page: "detail"; id: string } | { page: "classroom" } | { page: "run"; manifest: SessionManifest } | { page: "results"; bundle: ResultBundle | null } | { page: "import" };

let homeScrollPosition = 0;

function encodeJson(value: unknown): string { return btoa(unescape(encodeURIComponent(JSON.stringify(value)))); }
function decodeJson<T>(value: string): T | null { try { return JSON.parse(decodeURIComponent(escape(atob(value)))) as T; } catch { return null; } }
function parseHash(): View { const raw = window.location.hash.replace(/^#\/?/, ""); if (!raw || raw === "home") return { page: "home" }; if (raw === "classroom") return { page: "classroom" }; if (raw === "teacher-import") return { page: "import" }; if (raw === "results") return { page: "results", bundle: null }; if (raw.startsWith("detail/")) return { page: "detail", id: raw.slice(7) }; if (raw.startsWith("run/")) { const manifest = decodeJson<SessionManifest>(raw.slice(4)); if (manifest) return { page: "run", manifest }; } return { page: "home" }; }
function navigate(view: View): void {
  if (view.page === "home") {
    window.location.hash = "#/home";
    window.requestAnimationFrame(() => window.scrollTo(0, homeScrollPosition));
  } else {
    if (window.location.hash === "#/home" || !window.location.hash) {
      homeScrollPosition = window.scrollY;
    }
    if (view.page === "detail") window.location.hash = `#/detail/${view.id}`;
    else if (view.page === "classroom") window.location.hash = "#/classroom";
    else if (view.page === "import") window.location.hash = "#/teacher-import";
    else if (view.page === "results") window.location.hash = "#/results";
    else window.location.hash = `#/run/${encodeJson(view.manifest)}`;
    window.scrollTo(0, 0);
  }
}
async function enterFullscreen(): Promise<void> { if (document.fullscreenElement) return; try { await document.documentElement.requestFullscreen?.(); } catch { /* Fullscreen is an enhancement; blocked permission must not block the run. */ } }
async function exitFullscreen(): Promise<void> { if (!document.fullscreenElement) return; try { await document.exitFullscreen?.(); } catch { /* A browser may reject exit during navigation. */ } }

const participantCodePattern = /^[A-Za-z0-9_-]{0,24}$/;
const GITHUB_REPO_URL = "https://github.com/byJming/psylab-classroom";

export function App() {
  const [view, setView] = useState<View>(parseHash);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onHash = () => {
      const nextView = parseHash();
      setView(nextView);
      if (nextView.page === "home") {
        window.requestAnimationFrame(() => window.scrollTo(0, homeScrollPosition));
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const title = view.page === "detail" ? definitionMap[view.id]?.metadata.title : view.page === "classroom" ? "课堂会话" : view.page === "import" ? "教师导入" : view.page === "results" ? "实验结果" : view.page === "run" ? definitionMap[view.manifest.experimentId]?.metadata.title : "体验馆";
    document.title = `${title ?? "PsyLab"} · PsyLab`;
    if (view.page !== "run") mainRef.current?.focus({ preventScroll: true });
  }, [view]);
  const [lastResult, setLastResult] = useState<ResultBundle | null>(null);
  useEffect(() => { if (view.page === "results" && !lastResult) void loadLatestResult().then(setLastResult); }, [view.page, lastResult]);
  const goHome = () => navigate({ page: "home" });
  return (
    <div className={`app-shell ${view.page === "run" ? "run-mode" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={goHome} aria-label="返回体验馆">
          <span className="brand-mark" aria-hidden="true">PL</span>
          <span>PsyLab</span>
        </button>
        <nav aria-label="主导航">
          <button aria-current={view.page === "home" || view.page === "detail" ? "page" : undefined} onClick={goHome}>体验馆</button>
          <button aria-current={view.page === "classroom" ? "page" : undefined} onClick={() => navigate({ page: "classroom" })}>课堂会话</button>
          <button aria-current={view.page === "import" ? "page" : undefined} onClick={() => navigate({ page: "import" })}>教师导入</button>
        </nav>
        <div className="topbar-right">
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="topbar-github" aria-label="PsyLab GitHub 仓库">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </header>
      <main ref={mainRef} tabIndex={-1}>
        {view.page === "home" && <HomePage onDetail={(id) => { homeScrollPosition = window.scrollY; navigate({ page: "detail", id }); }} onClassroom={() => navigate({ page: "classroom" })} onResume={(manifest) => navigate({ page: "run", manifest })} onResults={() => navigate({ page: "results", bundle: null })} />}
        {view.page === "detail" && <DetailPage definition={definitionMap[view.id]} onRun={(manifest) => navigate({ page: "run", manifest })} onBack={goHome} />}
        {view.page === "classroom" && <ClassroomPage onRun={(manifest) => navigate({ page: "run", manifest })} />}
        {view.page === "run" && <RunPage manifest={view.manifest} onComplete={(bundle) => { setLastResult(bundle); window.location.hash = "#/results"; }} onExit={goHome} />}
        {view.page === "import" && <ImportPage />}
        {view.page === "results" && <ResultsPage bundle={view.bundle ?? lastResult} onHome={goHome} />}
        {view.page === "home" && (
          <footer className="footer">
            <div className="footer-content">
              <span>PsyLab · 浏览器原生心理学实验教学平台</span>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="footer-github">
                开源仓库 (GitHub) ↗
              </a>
            </div>
          </footer>
        )}
      </main>
    </div>
  );
}

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
  const rawCategories = Array.from(new Set(visibleDefinitions.map((definition) => presentationFor(definition.experimentId).category)));
  const categories = ["全部", ...rawCategories];
  const [category, setCategory] = useState("全部");
  const [resume, setResume] = useState<ResumeState>({ latest: null, draft: null });
  const [hideLatest, setHideLatest] = useState(false);

  useEffect(() => {
    void Promise.all([loadLatestResult(), listDrafts()]).then(([latest, drafts]) => {
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
  const filteredDefinitions = visibleDefinitions.filter((definition) => category === "全部" || presentationFor(definition.experimentId).category === category);

  const getCategoryCount = (cat: string) => {
    if (cat === "全部") return visibleDefinitions.length;
    return visibleDefinitions.filter((d) => presentationFor(d.experimentId).category === cat).length;
  };

  return (
    <div className="page home-page">
      {resume.draft && (
        <section className="resume-band draft">
          <div>
            <strong>你有一个未完成的《{titleOf(resume.draft.manifest.experimentId)}》</strong>
            <span>已在本浏览器记录 {resume.draft.trialCount} 个 trial；继续会从中断处接上，原始记录保留。</span>
          </div>
          <div className="resume-actions">
            <button className="primary" onClick={() => onResume(resume.draft!.manifest)}>继续任务 →</button>
            <button className="text-button" onClick={discardDraft}>不再继续</button>
          </div>
        </section>
      )}
      {!resume.draft && resume.latest && !hideLatest && (
        <section className="resume-band">
          <div>
            <strong>欢迎回来 · 上次你完成了《{titleOf(resume.latest.experiment.experimentId)}》</strong>
            <span>结果只保存在完成实验的浏览器里；可以回看，也可以换一个现象继续观察。</span>
          </div>
          <div className="resume-actions">
            <button className="primary" onClick={onResults}>查看上次结果 →</button>
            <button className="text-button" onClick={hideWelcomeBanner}>关闭</button>
          </div>
        </section>
      )}

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            <span>中文心理学实验平台 · 0.2 beta</span>
          </div>
          <h1>探索认知机制<br /><em>从可复现的心理实验开始</em></h1>
          <p className="hero-copy">
            面向高校心理学教学与公众科学体验。涵盖注意、反应抑制、空间表象与工作记忆等经典范式，全流程浏览器原生运行，数据本地留存与导出。
          </p>
          <div className="hero-actions">
            <button className="primary hero-btn" onClick={() => onDetail("simple-rt")}>
              开始体验 <span>→</span>
            </button>
            <button className="secondary-btn" onClick={onClassroom}>
              课堂会话模式
            </button>
          </div>
        </div>

        <div className="hero-features">
          <div className="feature-item">
            <div className="feature-icon-box">🔬</div>
            <div className="feature-text">
              <strong>经典实验范式</strong>
              <span>严格程序化刺激与试次平衡</span>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon-box">🔒</div>
            <div className="feature-text">
              <strong>纯本地优先与隐私</strong>
              <span>数据不出浏览器 · 支持 JSON/CSV 导出</span>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon-box">🎯</div>
            <div className="feature-text">
              <strong>教学与探索闭环</strong>
              <span>包含练习阶段、质量标记与即时描述性分析</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-head">
        <div>
          <p className="eyebrow">实验范式目录</p>
          <h2>选择一个现象开始探索</h2>
        </div>
        <span className="muted">共 {filteredDefinitions.length} 个实验</span>
      </section>

      <div className="catalog-toolbar" role="tablist" aria-label="实验分类筛选">
        {categories.map((item) => (
          <button
            key={item}
            role="tab"
            className={category === item ? "active" : ""}
            aria-selected={category === item}
            onClick={() => setCategory(item)}
          >
            <span>{item}</span>
            <small className="tab-count">{getCategoryCount(item)}</small>
          </button>
        ))}
      </div>

      <div className="experiment-grid">
        {filteredDefinitions.map((definition, index) => (
          <ExperimentCard
            key={definition.experimentId}
            definition={definition}
            index={index}
            onClick={() => onDetail(definition.experimentId)}
          />
        ))}
      </div>
    </div>
  );
}

function ExperimentCard({ definition, index, onClick }: { definition: ExperimentDefinition; index: number; onClick: () => void }) {
  const presentation = presentationFor(definition.experimentId);
  return (
    <article
      className={`experiment-card ${presentation.accent}`}
      role="button"
      tabIndex={0}
      aria-label={`查看 ${definition.metadata.title}`}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}
    >
      <div className="card-cover-wrap">
        <div className="card-top-badges">
          <span className="number">#{String(index + 1).padStart(2, "0")}</span>
          <span className="card-tag">{presentation.category}</span>
        </div>
        <ExperimentPreview kind={presentation.previewKind} label={presentation.previewLabel} compact />
        <div className="card-status-badge">{tierStatusLabel(definition.runPolicy.tier, definition.metadata.status)}</div>
      </div>

      <div className="card-body">
        <h3>{definition.metadata.title}</h3>
        <p className="card-purpose">{definition.metadata.purpose}</p>

        <div className="card-footer">
          <span className="duration-tag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            {definition.metadata.durationMinutes.min}-{definition.metadata.durationMinutes.max} 分钟
          </span>
          <span className="card-open" aria-hidden="true">
            进入实验 <span>→</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function KeycapBadges({ text }: { text: string }) {
  // 简易实体键帽解析渲染
  const parts = text.split(/([A-Z0-9←→/]+|\b空格键\b|\b不按\b)/g);
  return (
    <span className="keycap-group">
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part === "空格键") return <kbd key={idx} className="keycap wide">Space 空格</kbd>;
        if (part === "不按") return <span key={idx} className="keycap-noop">无需按键</span>;
        if (/^[A-Z0-9←→]+$/.test(part)) return <kbd key={idx} className="keycap">{part}</kbd>;
        return <span key={idx} className="keycap-text">{part}</span>;
      })}
    </span>
  );
}

function getResponseVisualBadge(action: string, detail: string, key: string) {
  const combined = `${action} ${detail}`;
  if (combined.includes("红")) {
    return <span className="key-color-dot dot-red" title="红色目标" />;
  }
  if (combined.includes("绿")) {
    return <span className="key-color-dot dot-green" title="绿色目标" />;
  }
  if (combined.includes("蓝")) {
    return <span className="key-color-dot dot-blue" title="蓝色目标" />;
  }
  if (combined.includes("紫")) {
    return <span className="key-color-dot dot-purple" title="紫色目标" />;
  }
  if (combined.includes("向左") || combined.includes("在左") || action.includes("左")) {
    return <span className="key-action-badge badge-left">◀ 向左</span>;
  }
  if (combined.includes("向右") || combined.includes("在右") || action.includes("右")) {
    return <span className="key-action-badge badge-right">向右 ▶</span>;
  }
  if (combined.includes("Go") || (key === "空格" && combined.includes("圆形"))) {
    return <span className="key-action-badge badge-go">GO · 行动</span>;
  }
  if (combined.includes("No-Go") || key === "不按" || combined.includes("方形")) {
    return <span className="key-action-badge badge-nogo">NO-GO · 静止</span>;
  }
  if (action.includes("相同") || action.includes("找到了") || action.includes("同一个形状") || action.includes("有信号")) {
    return <span className="key-action-badge badge-match">✓ 匹配 / 目标</span>;
  }
  if (action.includes("不相同") || action.includes("没有") || action.includes("镜像形状") || action.includes("无信号")) {
    return <span className="key-action-badge badge-diff">✕ 差异 / 排除</span>;
  }
  return null;
}

function InstructionGuide({ presentation }: { presentation: ReturnType<typeof presentationFor> }) {
  const { guide } = presentation;
  return (
    <>
      {/* 核心法则 Banner */}
      <div className="instruction-focus-banner">
        <div className="focus-kicker-row">
          <span className="focus-badge">🎯 核心规则</span>
        </div>
        <h2 className="focus-heading">{guide.focus}</h2>
        <p className="focus-response-lead">{guide.response}</p>
      </div>

      {/* 按键对照卡片 */}
      <div className="guide-section">
        <div className="guide-section-header">
          <span className="guide-section-kicker">按键对照</span>
          <h3 className="guide-section-title">每次只按一个键</h3>
        </div>
        <div className="instruction-key-deck">
          {guide.responses.map((response) => (
            <div className="key-deck-card" key={`${response.key}-${response.action}`}>
              <div className="key-deck-cap-wrap">
                {response.key === "空格" ? (
                  <kbd className="keycap keycap-space">Space 空格</kbd>
                ) : response.key === "不按" ? (
                  <span className="keycap-noop">保持不按</span>
                ) : (
                  <kbd className="keycap keycap-char">{response.key}</kbd>
                )}
              </div>
              <div className="key-deck-info">
                <div className="key-deck-action-line">
                  <strong>{response.action}</strong>
                  {getResponseVisualBadge(response.action, response.detail, response.key)}
                </div>
                <small>{response.detail}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 作答流程时序 */}
      <div className="guide-section">
        <div className="guide-section-header">
          <span className="guide-section-kicker">作答流程</span>
          <h3 className="guide-section-title">按步骤完成每道题</h3>
        </div>
        <div className="guide-timeline-flow">
          {guide.steps.map((step, index) => (
            <div className="timeline-node" key={step.title}>
              <div className="node-head">
                <span className="node-index">{index + 1}</span>
                <strong className="node-title">{step.title}</strong>
              </div>
              <p className="node-desc">{step.description}</p>
              {index < guide.steps.length - 1 && (
                <span className="node-connector" aria-hidden="true">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 图解示例（如 N-back） */}
      {guide.example && (
        <div className="guide-section">
          <div className="guide-section-header">
            <span className="guide-section-kicker">图解示例</span>
            <h3 className="guide-section-title">{guide.example.title}</h3>
          </div>
          <div className="example-card-section">
            <p className="example-rule-lead">{guide.example.rule}</p>
            <div className="example-sequence-grid" aria-label="示例序列">
              {guide.example.sequence.map((item, index) => {
                const isCurrent = index === guide.example!.currentIndex;
                const isCompare = index === guide.example!.compareIndex;
                return (
                  <div className={`example-tile ${isCurrent ? "is-current" : ""} ${isCompare ? "is-compare" : ""}`} key={`${item}-${index}`}>
                    <span className="tile-pos">第 {index + 1} 题</span>
                    <strong className="tile-stimulus">{item}</strong>
                    {isCurrent && <span className="tile-badge current-badge">当前待判</span>}
                    {isCompare && <span className="tile-badge compare-badge">对比参照</span>}
                  </div>
                );
              })}
            </div>
            <div className="example-answer-box">
              <span className="answer-icon">💡</span>
              <p>{guide.example.answer}</p>
            </div>
          </div>
        </div>
      )}

      {/* 补充注释 */}
      {guide.note && (
        <div className="guide-note-box">
          <span className="note-icon">ℹ️</span>
          <p className="note-text">{guide.note}</p>
        </div>
      )}
    </>
  );
}

function DetailPage({ definition, onRun, onBack }: { definition?: ExperimentDefinition; onRun: (manifest: SessionManifest) => void; onBack: () => void }) {
  const [creating, setCreating] = useState(false);
  if (!definition) return <EmptyState message="找不到这个实验定义" onBack={onBack} />;

  const start = async () => {
    setCreating(true);
    const config = defaultConfig(definition.experimentId);
    const hash = await sha256(config);
    onRun({
      format: "psylab-session",
      formatVersion: "1.0",
      experimentId: definition.experimentId,
      definitionVersion: definition.definitionVersion,
      distributionTier: definition.runPolicy.tier,
      runPolicyVersion: definition.runPolicy.version,
      config,
      configHash: hash,
      sessionId: makeId("session"),
      createdAt: new Date().toISOString()
    });
  };

  const presentation = presentationFor(definition.experimentId);
  const narrowViewport = typeof window !== "undefined" && window.innerWidth < 800;

  return (
    <div className="page detail-page">
      <nav className="breadcrumb" aria-label="页面路径导航">
        <button className="bc-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          返回实验馆
        </button>
        <span className="bc-sep">/</span>
        <span className="bc-category">{presentation.category}</span>
        <span className="bc-sep">/</span>
        <span className="bc-current">{definition.metadata.title}</span>
      </nav>

      {narrowViewport && (
        <div className="mobile-notice">
          ⚠️ 当前窗口宽度不足 800px，心理实验建议在桌面 Chrome/Edge 下搭配实体键盘进行以获得最佳体验。
        </div>
      )}

      <section className="detail-hero">
        <div className="detail-hero-content">
          <div className="detail-hero-tags">
            <span className="detail-category-badge">{presentation.category}</span>
            <span className="status-pill">{tierStatusLabel(definition.runPolicy.tier, definition.metadata.status)}</span>
          </div>
          <h1>{definition.metadata.title}</h1>
          <p className="detail-lead">{definition.metadata.purpose}</p>
        </div>

        <div className={`detail-hero-board ${presentation.accent}`}>
          <div className="board-top">
            <span className="board-tag">刺激示意图</span>
            <span className="board-code">#{definition.experimentId}</span>
          </div>
          <div className="board-art-wrap">
            <ExperimentPreview kind={presentation.previewKind} label={presentation.previewLabel} />
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-main-col">
          <section className="detail-card">
            <div className="card-section-head">
              <span className="sec-icon">📖</span>
              <h2>理论背景与机制</h2>
            </div>
            <p className="detail-theory-text">{definition.metadata.theoryBackground}</p>
          </section>

          <section className="detail-card">
            <div className="card-section-head">
              <span className="sec-icon">⚖️</span>
              <h2>实验变量与设计</h2>
            </div>
            <div className="variable-grid">
              <div className="var-card iv-card">
                <div className="var-card-header">
                  <span className="var-type-tag iv">自变量 (IV)</span>
                  <span className="var-count">{definition.metadata.independentVariables.length} 个维度</span>
                </div>
                <ul className="var-list">
                  {definition.metadata.independentVariables.map((iv, idx) => (
                    <li key={idx}>{iv}</li>
                  ))}
                </ul>
              </div>
              <div className="var-card dv-card">
                <div className="var-card-header">
                  <span className="var-type-tag dv">因变量 (DV)</span>
                  <span className="var-count">{definition.metadata.dependentVariables.length} 个指标</span>
                </div>
                <ul className="var-list">
                  {definition.metadata.dependentVariables.map((dv, idx) => (
                    <li key={idx}>{dv}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="detail-card">
            <div className="card-section-head">
              <span className="sec-icon">🔄</span>
              <h2>实验流程概览</h2>
            </div>
            <div className="task-flow-strip">
              <div className="flow-step">
                <div className="flow-step-num">1</div>
                <div className="flow-step-info">
                  <strong>环境预检与准备</strong>
                  <span>浏览器全屏与键盘响应校验</span>
                </div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-step">
                <div className="flow-step-num">2</div>
                <div className="flow-step-info">
                  <strong>交互练习阶段</strong>
                  <span>即时反馈以熟悉按键与作答规则</span>
                </div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-step">
                <div className="flow-step-num">3</div>
                <div className="flow-step-info">
                  <strong>正式测试与分析</strong>
                  <span>真实试次记录、数据清洗与即时描述</span>
                </div>
              </div>
            </div>
          </section>

          <section className="detail-card">
            <div className="card-section-head">
              <span className="sec-icon">💡</span>
              <h2>测试须知与隐私约定</h2>
            </div>
            <ul className="detail-checklist">
              <li><strong>实体键盘输入</strong>：推荐在桌面 Chrome 或 Edge 浏览器使用外接或内置实体键盘作答。</li>
              <li><strong>防意外中断</strong>：先完成练习再进入正式阶段；如遇误关闭，重新进入可恢复未完成进度。</li>
              <li><strong>纯本地计算</strong>：数据全程只在当前浏览器运算和存储，绝不上传个人信息或网络服务器。</li>
              <li><strong>探索与教学导向</strong>：结果主要用于课堂研讨与心理学现象体验，不可作为临床或能力诊断依据。</li>
            </ul>
            {definition.runPolicy.requiresParticipantAcknowledgement && (
              <div className="detail-notice-box">
                <strong>增强告知提示</strong>
                <p>该实验包含特殊指导语设计，完成后将显示完整的事后解释说明 (Debriefing)。</p>
              </div>
            )}
          </section>
        </div>

        <aside className="detail-side-col">
          <div className="start-panel">
            <div className="panel-top-badge">准备就绪</div>

            <div className="panel-param-block">
              <span className="param-label">预计用时</span>
              <strong className="param-value">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {definition.metadata.durationMinutes.min} ~ {definition.metadata.durationMinutes.max} 分钟
              </strong>
            </div>

            <div className="panel-param-block">
              <span className="param-label">按键配置</span>
              <div className="keycap-container">
                <KeycapBadges text={presentation.responseKeys} />
              </div>
            </div>

            <div className="panel-param-block">
              <span className="param-label">运行模式</span>
              <div className="panel-mode-tag">
                <span className="mode-dot"></span>
                <span>体验馆预设模式 (单机本地)</span>
              </div>
            </div>

            <button className="primary full start-action-btn" onClick={start} disabled={creating}>
              {creating ? "正在构建环境…" : "开始实验 →"}
            </button>

            <p className="start-panel-tip">
              点击后将进入作答引导页面，期间可随时全屏或安全退出。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
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
  const presentation = presentationFor(manifest.experimentId); const runnerTone = `runner-${manifest.experimentId}`;
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
  if (stage === "instructions") return (
    <div className={`runner-page runner-instructions ${runnerTone}`}>
      <div className="runner-card instruction-card">
        {/* Hero 头部：实验预览 + 元信息 */}
        <div className="instruction-hero-header">
          <div className="instruction-hero-meta">
            <div className="instruction-hero-tags">
              <span className="hero-category-tag">{presentation.category}</span>
              <span className="status-pill">{tierStatusLabel(definition.runPolicy.tier, definition.metadata.status)}</span>
              {presentation.colorSensitive && (
                <span className="hero-condition-tag">🎨 色觉敏感</span>
              )}
            </div>
            <h1 className="instruction-hero-title">{definition.metadata.title}</h1>
            <p className="instruction-hero-desc">{definition.metadata.purpose}</p>
          </div>
          <div className="instruction-hero-preview">
            <ExperimentPreview kind={presentation.previewKind} label={presentation.previewLabel} />
            <span className="preview-label-tag">{presentation.previewLabel}</span>
          </div>
        </div>

        {/* 核心规则 + 按键 + 流程 */}
        <InstructionGuide presentation={presentation} />

        {/* 实验结构规划（练习 vs 正式） */}
        <div className="instruction-phase-roadmap">
          <div className="guide-section-header">
            <span className="guide-section-kicker">任务结构</span>
            <h3 className="guide-section-title">分为练习和正式两个阶段</h3>
          </div>
          <div className="phase-cards-grid">
            <div className="phase-card-box">
              <div className="phase-box-top">
                <span className="phase-pill">练习阶段</span>
                <span className="phase-trial-count">{practiceCount} 题</span>
              </div>
              <span className="phase-feature-tag feedback-yes">✓ 实时对错反馈</span>
              <div className="phase-box-body">
                <p>帮助你熟悉节奏和规则，不计入最终结果。</p>
              </div>
            </div>
            <div className="phase-card-box">
              <div className="phase-box-top">
                <span className="phase-pill formal-pill">正式测试</span>
                <span className="phase-trial-count">{Number(manifest.config.testTrials)} 题</span>
              </div>
              <span className="phase-feature-tag feedback-no">无对错提示</span>
              <div className="phase-box-body">
                <p>条件：{presentation.conditionLine}。保持专注，按规则如实作答。</p>
              </div>
            </div>
          </div>
        </div>

        {/* 警示提示 */}
        {presentation.colorSensitive && (
          <div className="instruction-alert-box alert-warning">
            <span className="alert-icon">⚠️</span>
            <div>
              <strong>色觉提示</strong>
              <p>本任务需要可靠区分颜色。如无法可靠辨别，请退出。</p>
            </div>
          </div>
        )}

        {definition.runPolicy.requiresParticipantAcknowledgement && (
          <div className="instruction-alert-box alert-info">
            <span className="alert-icon">📋</span>
            <div>
              <strong>事后说明（Debrief）</strong>
              <p>完成后必须阅读事后说明，才能查看结果。</p>
            </div>
          </div>
        )}

        {/* 参与者代号区 */}
        <div className="instruction-participant-section">
          <label className="field-title" htmlFor="participant-code-input">
            匿名参与者代码（可选）
          </label>
          <input
            id="participant-code-input"
            className="participant-input"
            value={participantCode}
            maxLength={24}
            onChange={(event) => setParticipantCode(event.target.value)}
            placeholder="不填写将自动生成"
            autoComplete="off"
          />
          <span className={`participant-help-text ${codeInvalid ? "error" : ""}`}>
            {codeInvalid
              ? "仅支持字母、数字、下划线和连字符，不超过 24 个字符。"
              : "不填写会自动生成；不要填入姓名、学号等真实身份信息。"}
          </span>
        </div>

        {(definition.runPolicy.requiresTeacherAcknowledgement || definition.runPolicy.requiresParticipantAcknowledgement) && (
          <div className="consent-box">
            <label>
              <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
              我已阅读说明，并同意完成后阅读必要的事后说明。
            </label>
          </div>
        )}

        <div className="runner-actions">
          <button className="text-button" onClick={() => { void exitFullscreen(); onExit(); }}>退出</button>
          <button
            className="primary instruction-start-btn"
            disabled={((definition.runPolicy.requiresTeacherAcknowledgement || definition.runPolicy.requiresParticipantAcknowledgement) && !ack) || codeInvalid}
            onClick={async () => {
              const code = participantCode.trim() || makeId("anon");
              setRunnerError("");
              setParticipantCode(code);
              await enterFullscreen();
              setIndex(0);
              setStage("practice");
            }}
          >
            开始练习 →
          </button>
        </div>
      </div>
    </div>
  );
  if (stage === "transition") { const practiceTrials = trials.filter((trial) => trial.phase === "practice"); const correctCount = practiceTrials.filter((trial) => trial.correct === true).length; const accuracy = practiceTrials.length ? Math.round((correctCount / practiceTrials.length) * 100) : null; return <div className={`runner-page ${runnerTone}`}><div className="runner-card"><span className="status-pill">练习完成</span><h1>准备好进入正式测试了吗？</h1><p className="lead">练习结果不会进入正式摘要。正式阶段不再显示对错提示，请按练习时同样的规则作答。</p><div className="practice-summary"><div><span>练习试次</span><strong>{practiceTrials.length}</strong></div><div><span>正确</span><strong>{correctCount}</strong></div><div><span>正确率</span><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong></div></div><div className="runner-actions"><button className="text-button" onClick={() => { void exitFullscreen(); onExit(); }}>退出</button><button className="text-button" onClick={restartPractice}>再练一次</button><button className="primary" onClick={beginTest}>开始正式测试 →</button></div></div></div>; }
  if (stage === "debrief") return <div className={`runner-page ${runnerTone}`}><div className="runner-card"><span className="status-pill">任务完成</span><h1>{definition.runPolicy.requiresDebrief ? "先完成事后说明" : "你的结果已准备好"}</h1><p className="lead">{definition.runPolicy.requiresDebrief ? "这一步用于解释实验现象和局限，阅读后才能查看结果。" : "原始 trial、指标版本和质量标记已保存在当前浏览器。"}</p>{definition.runPolicy.requiresDebrief && <div className="method-box"><p>条件差异是本次任务中的描述性现象，不代表稳定的个人特征；设备和输入延迟可能影响反应时。</p></div>}<div className="runner-actions"><button className="text-button" onClick={() => { void exitFullscreen(); onExit(); }}>稍后处理</button><button className="primary" onClick={async () => { if (result) { const completed = definition.runPolicy.requiresDebrief ? { ...result, quality: { ...result.quality, flags: [...(result.quality.flags ?? []), "debrief-completed"] } } : result; await saveResult(completed); await deleteDraft(draftKey); await exitFullscreen(); onComplete(completed); } }}>查看结果 →</button></div></div></div>;
  if (stage === "exit") return <div className={`runner-page ${runnerTone}`}><div className="runner-card"><span className="status-pill">已保存 {trials.length} 个 trial</span><h1>结束本次任务？</h1><p className="lead">你可以保存一份标记为“中途退出”的结果，之后由教师单独处理；也可以保留草稿继续完成。</p><div className="method-box"><p>中断结果会保留原始 trial、质量标记和排除原因，但不会被当作完整任务摘要。</p></div><div className="runner-actions"><button className="text-button" onClick={() => setStage(trials.length < practiceCount ? "practice" : "test")}>继续任务</button><button className="text-button" onClick={() => void discardAndExit()}>放弃草稿</button><button className="primary" onClick={() => void saveInterrupted()}>保存中断结果</button></div></div></div>;
  if (runnerError && (stage === "practice" || stage === "test")) return <div className={`runner-page ${runnerTone}`}><div className="runner-card runner-error"><span className="status-pill">实验未能继续</span><h1>运行时出现问题</h1><p className="lead">{runnerError}</p><p className="small">已记录的 trial 会保留在本地草稿中；退出后可以重新打开本次会话继续。</p><div className="runner-actions"><button className="primary" onClick={() => { setRunnerError(""); onExit(); }}>返回体验馆</button></div></div></div>;
  if (stage === "practice" || stage === "test") return <JsPsychStage experimentId={manifest.experimentId} experimentTitle={definition.metadata.title} stage={stage} plans={plans} startIndex={index} focusLossCount={focusLossCount} baseTrials={trials} onTrial={handleJsPsychTrial} onComplete={handleJsPsychComplete} onError={handleJsPsychError} onExit={requestExit} />;
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

function ConditionMetricsTable({ experimentId, metrics }: { experimentId: string; metrics: MetricsResult }) {
  const rows = Object.entries(metrics.byCondition);
  const showAccuracy = rows.some(([, value]) => value.accuracy !== null);
  const showRt = rows.some(([, value]) => value.medianRtMs !== null);
  return <div className="condition-table-wrap"><table className="condition-table"><thead><tr><th>条件</th><th>正式试次</th>{showAccuracy && <th>正确率</th>}{showRt && <th>中位数 RT</th>}</tr></thead><tbody>{rows.map(([condition, value]) => <tr key={condition}><th scope="row">{conditionLabel(experimentId, condition)}</th><td>{value.n}</td>{showAccuracy && <td>{value.accuracy === null ? "暂无" : `${Math.round(value.accuracy * 100) / 100}%`}</td>}{showRt && <td>{formatMetricValue(value.medianRtMs, "ms")}</td>}</tr>)}</tbody></table></div>;
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
  return <div className="page narrow result-page"><div className="result-header"><span className="status-pill">{tierStatusLabel(bundle.experiment.distributionTier, definition.metadata.status)}</span><h1>这是本次任务的结果</h1><p className="lead">{definition.metadata.title} · {presentationFor(definition.experimentId).conditionLine}</p></div>{publicView && <section className="public-result-card"><div><span className="section-kicker">大众读法</span><h2>{publicView.publicMetric.label}</h2><p>{publicView.publicMetric.description}</p></div><div className="public-result-value"><strong>{formatMetricValue(publicView.value, publicView.metric?.unit ?? "")}</strong><span>{publicView.publicMetric.interpretation}</span></div></section>}<div className="quality-panel"><div><strong>数据质量</strong><span>{bundle.quality.completed ? "已完成" : "中途退出"} · {effectiveTrials} 个有效正式试次</span></div><div className="quality-flags">{qualityFlags.length ? qualityFlags.map((flag) => <span key={flag}>{qualityFlagLabels[flag] ?? flag}</span>) : <span className="good">无额外标记</span>}</div></div><section className="result-detail-section"><div className="section-title"><div><span className="section-kicker">详细指标</span><h2>按条件查看</h2></div><p>反应时仅统计通过清洗规则的正确试次。</p></div><ConditionMetricsTable experimentId={bundle.experiment.experimentId} metrics={metrics} /><div className="metric-grid compact">{Object.entries(metrics.cleaned).map(([key, value]) => { const metric = definition.metrics.find((item) => item.id === key); return <div className="metric-card" key={key}><span>{metric?.label ?? key}</span><strong>{formatMetricValue(value, metric?.unit ?? "")}</strong><small>{metric?.description ?? "描述性指标"}</small></div>; })}</div></section><details className="method-details"><summary>方法、版本与限制</summary><p>{definition.metadata.limitations?.join(" ")}</p><div className="session-echo"><div><span>匿名参与者代码</span><strong>{bundle.session.participantCode}</strong></div><div><span>会话</span><strong>{bundle.session.sessionId}</strong></div><div><span>完成时间</span><strong>{formatTimestamp(bundle.exportedAt)}</strong></div><div><span>运行环境</span><strong>{bundle.environment.browserFamily} · {bundle.environment.platformFamily} · {viewportBucketLabels[bundle.environment.viewportBucket] ?? bundle.environment.viewportBucket}</strong></div></div><p>实验版本 {bundle.experiment.definitionVersion} · 指标规则 {bundle.experiment.metricsVersion} · 配置哈希 <code>{bundle.experiment.configHash}</code></p></details>
      <div className="submit-guide"><strong>{isClassroomResult ? "交回结果" : "保存结果"}</strong><p>{isClassroomResult ? "下载 JSON，不要改名或编辑，按老师要求提交。" : "结果只在当前浏览器中；需要留存时请下载 JSON。"}</p><code>{resultJsonFilename(bundle)}</code></div>
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
