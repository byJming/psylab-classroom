import { useEffect, useRef, useState } from "react";
import type { TrialOutcome, TrialPlan, TrialRecord } from "../types";
import { compileTimeline, createJsPsychRuntime } from "../runtime/jspsychAdapter";

interface JsPsychStageProps {
  experimentId: string;
  experimentTitle: string;
  stage: "practice" | "test";
  plans: TrialPlan[];
  startIndex: number;
  focusLossCount: number;
  baseTrials: TrialRecord[];
  onTrial: (trial: TrialRecord) => void;
  onComplete: (trials: TrialRecord[]) => void;
  onError: (message: string) => void;
  onExit: () => void;
}

type PracticeFeedbackKind = "ok" | "error" | "miss" | "early";
const feedbackCopy: Record<PracticeFeedbackKind, string> = { ok: "✓ 正确", error: "✗ 错误", miss: "未响应", early: "按早了" };

function responseForPlan(_plan: TrialPlan, actualResponse: string | null, anticipationResponse: string | null): string | null {
  return anticipationResponse ?? actualResponse;
}

export function JsPsychStage({ experimentId, experimentTitle, stage, plans, startIndex, focusLossCount, baseTrials, onTrial, onComplete, onError, onExit }: JsPsychStageProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const focusLossRef = useRef(focusLossCount);
  const startedRef = useRef(false);
  const callbacksRef = useRef({ onTrial, onComplete, onError });
  const baseTrialsRef = useRef(baseTrials);
  const stageKeyRef = useRef<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: PracticeFeedbackKind; id: number } | null>(null);
  focusLossRef.current = focusLossCount;
  callbacksRef.current = { onTrial, onComplete, onError };
  const stageKey = `${stage}:${startIndex}`;
  if (stageKeyRef.current !== stageKey) { stageKeyRef.current = stageKey; baseTrialsRef.current = baseTrials; }

  useEffect(() => {
    if (!displayRef.current || startedRef.current) return;
    startedRef.current = true;
    let disposed = false;
    let runtime: Awaited<ReturnType<typeof createJsPsychRuntime>> | null = null;
    const pendingDelay = new Map<number, { response: string | null; rtMs: number | null }>();
    const earlyResponses = new Set<number>();
    const stagePlans = plans.map((plan, index) => ({ plan, index })).filter((item) => item.index >= startIndex && item.plan.phase === stage);
    const localTrials: TrialRecord[] = [];
    const stagePlanIndexes = stagePlans.map((item) => item.index);

    const showFeedback = (kind: PracticeFeedbackKind, id: number) => {
      setFeedback({ kind, id });
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 700);
    };

    const handleTrialFinish = (data: Record<string, unknown>) => {
      const planIndex = Number(data.planIndex);
      if (data.role === "delay") {
        const response = typeof data.response === "string" ? data.response : null;
        pendingDelay.set(planIndex, { response, rtMs: typeof data.rt === "number" ? Math.round(data.rt) : null });
        if (response !== null) earlyResponses.add(planIndex);
        return;
      }
      if (data.role === "cue") return;
      const item = stagePlans.find((candidate) => candidate.index === planIndex);
      if (!item) return;
      const plan = item.plan;
      const delay = pendingDelay.get(planIndex);
      const actualResponse = typeof data.response === "string" ? data.response : null;
      const anticipationResponse = delay?.response ?? null;
      const recordedResponse = responseForPlan(plan, actualResponse, anticipationResponse);
      const noResponseExpected = plan.correctResponse === null;
      const correct = !anticipationResponse && (noResponseExpected ? actualResponse === null : actualResponse === plan.correctResponse);
      const anticipation = anticipationResponse !== null;
      const noResponseError = actualResponse === null && !noResponseExpected;
      const focusLost = focusLossRef.current > 0;
      const outcome: TrialOutcome = focusLost ? "focus-loss" : anticipation ? "anticipation" : noResponseError ? "no-response" : correct ? "correct" : "incorrect";
      const incorrectResponse = !anticipation && !noResponseError && !correct;
      const trial: TrialRecord = {
        trialIndex: planIndex,
        phase: plan.phase,
        condition: plan.condition,
        stimulusId: plan.stimulusId,
        correctResponse: plan.correctResponse,
        response: recordedResponse,
        correct,
        outcome,
        rtMs: typeof data.rt === "number" ? Math.max(0, Math.round(data.rt)) : null,
        stimulusDurationMs: null,
        visibilityState: document.visibilityState === "visible" ? "visible" : "hidden",
        focusLostBeforeResponse: focusLost,
        excluded: noResponseError || !correct || focusLost || anticipation,
        exclusionReasons: [...(noResponseError ? ["no-response"] : []), ...(incorrectResponse ? ["incorrect"] : []), ...(focusLost ? ["focus-loss"] : []), ...(anticipation ? ["anticipation"] : [])],
        data: { ...plan.data, responseWindowMs: Number(data.responseWindowMs ?? (noResponseExpected ? 1000 : 2500)), responseDuringWindow: actualResponse, anticipationResponse, anticipationRtMs: delay?.rtMs ?? null }
      };
      pendingDelay.delete(planIndex);
      focusLossRef.current = 0;
      localTrials.push(trial);
      setCompletedCount(localTrials.length);
      if (plan.phase === "practice") {
        // 敏感实验的“按早了”已由时间线反馈试次呈现，这里避免重复提示。
        if (!(anticipation && plan.data.anticipationSensitive === true)) showFeedback(anticipation ? "early" : noResponseError ? "miss" : correct ? "ok" : "error", planIndex);
      }
      callbacksRef.current.onTrial(trial);
    };

    const run = async () => {
      try {
        // jsPsych 的 run() 会向 display element 追加新的内容容器而不清除旧容器；
        // 重启（阶段切换、断点恢复）前必须清空，否则节点与页面高度会随试次累积。
        displayRef.current?.replaceChildren();
        const compiled = compileTimeline(stagePlans.map((item) => item.plan), stagePlanIndexes, { earlyResponses });
        runtime = await createJsPsychRuntime(compiled, { displayElement: displayRef.current!, onTrialFinish: handleTrialFinish });
        if (disposed) { runtime.jsPsych.abortExperiment(); return; }
        await runtime.jsPsych.run(runtime.timeline);
        if (!disposed) callbacksRef.current.onComplete([...baseTrialsRef.current, ...localTrials]);
      } catch (error: unknown) {
        if (!disposed) callbacksRef.current.onError(error instanceof Error ? error.message : "实验时间线运行失败");
      }
    };
    void run();
    return () => { disposed = true; startedRef.current = false; runtime?.jsPsych.abortExperiment(); if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current); };
  }, [stage, plans, startIndex]);

  const stageTotal = Math.max(1, plans.filter((plan) => plan.phase === stage).length);
  const progress = Math.min(completedCount + 1, stageTotal);
  return <div className={`runner-page runner-${experimentId}`}>
    <div className="runner-progress"><div><strong>{experimentTitle}</strong><span>{stage === "practice" ? "练习阶段" : "正式阶段"}</span></div><div className="trial-progress"><span>{progress} / {stageTotal}</span><div role="progressbar" aria-label={stage === "practice" ? "练习进度" : "正式进度"} aria-valuemin={1} aria-valuemax={stageTotal} aria-valuenow={progress}><i style={{ width: `${(progress / stageTotal) * 100}%` }} /></div></div></div>
    <div className="stage-wrap">
      <div ref={displayRef} className="jspsych-stage" aria-live="off" />
      {feedback && <div className={`stage-feedback ${feedback.kind}`} key={feedback.id} role="status">{feedbackCopy[feedback.kind]}</div>}
    </div>
    {focusLossCount > 0 && <div className="focus-toast" role="status">检测到页面失焦：本试次会标记 focus-loss 并从摘要排除</div>}
    <button className="exit-run" onClick={onExit}>退出实验</button>
  </div>;
}
