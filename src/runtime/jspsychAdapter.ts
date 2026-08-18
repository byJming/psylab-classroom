import type { TrialPlan } from "../types";
import { mentalRotationSvgMarkup } from "../experiments/stimuli";

export type JsPsychTrialRole = "delay" | "response";

/** jsPsych 支持在试次开始时求值的函数参数；用于提前反应后把响应窗替换为即时反馈。 */
export type DynamicParameter<T> = T | (() => T);

export interface CompiledJsPsychTrial {
  type: "html-keyboard-response";
  stimulus: DynamicParameter<string>;
  choices: DynamicParameter<string[]>;
  trial_duration: DynamicParameter<number>;
  response_ends_trial: boolean;
  post_trial_gap: number;
  data: Record<string, unknown> & { role: JsPsychTrialRole; planIndex: number };
}

export interface CompileTimelineOptions {
  /** 注视期内已发生提前按键的 planIndex 集合；命中的试次显示“按早了”反馈而不是刺激。 */
  earlyResponses?: Set<number>;
}

export interface JsPsychRuntimeOptions {
  displayElement?: HTMLElement;
  onTrialFinish?: (data: Record<string, unknown>) => void;
}

const FIXATION_MARKUP = `<div class="measured-fixation" aria-hidden="true"></div>`;
const EARLY_RESPONSE_MARKUP = `<div class="measured-feedback" role="status">按早了</div>`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function safeColor(value: unknown): string {
  const color = String(value ?? "#1f2933");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#1f2933";
}

function responseKeys(plan: TrialPlan): string[] {
  if (plan.data.targetType === "go" || plan.data.targetType === "no-go") return [" "];
  if (plan.data.responseKey === "f" || plan.data.responseKey === "j" || plan.data.responseKey === "k") return ["f", "j", "k"];
  if (plan.correctResponse === " ") return [" "];
  return ["f", "j"];
}

function stimulusMarkup(plan: TrialPlan): string {
  if (plan.data.stimulusType === "corner-blocks") return mentalRotationSvgMarkup(Number(plan.data.angle), Boolean(plan.data.same));
  if (plan.data.targetType === "go" || plan.data.targetType === "no-go") return `<div class="measured-shape measured-go-no-go ${plan.data.targetType === "go" ? "go" : "no-go"}" aria-hidden="true"></div>`;
  if (plan.data.color) return `<div class="measured-word" style="color:${safeColor(plan.data.color)}">${escapeHtml(plan.stimulus)}</div>`;
  if (plan.stimulus === "●") return `<div class="measured-shape measured-simple-rt" aria-hidden="true"></div>`;
  return `<div class="measured-text">${escapeHtml(plan.stimulus)}</div>`;
}

/**
 * Compiles each plan into a fixation window followed by a response window and an
 * inter-trial gap (`post_trial_gap`).
 *
 * - The fixation window renders a central fixation cross. For anticipation-sensitive
 *   experiments (Simple RT, Go/No-Go) a keypress during fixation ends the window
 *   immediately; the response window then evaluates its function parameters and
 *   shows the "按早了" feedback instead of the stimulus.
 * - Other experiments keep listening through the fixation window without ending it,
 *   so an early key is retained in jsPsych data and marked as anticipation later.
 */
export function compileTimeline(plans: TrialPlan[], planIndexes?: number[], options: CompileTimelineOptions = {}): CompiledJsPsychTrial[] {
  return plans.flatMap((plan, index) => {
    const planIndex = planIndexes?.[index] ?? index;
    const fixationMs = Math.max(0, Number(plan.data.fixationMs ?? 400));
    const responseWindowMs = Math.max(100, Number(plan.data.responseWindowMs ?? (plan.correctResponse === null ? 1000 : 2500)));
    const itiMs = Math.max(0, Number(plan.data.itiMs ?? 0));
    const choices = responseKeys(plan);
    const sensitive = plan.data.anticipationSensitive === true;
    const earlyResponse = () => options.earlyResponses?.has(planIndex) === true;
    const commonData = { phase: plan.phase, condition: plan.condition, stimulusId: plan.stimulusId, ...plan.data, planIndex };
    return [
      { type: "html-keyboard-response", stimulus: FIXATION_MARKUP, choices, trial_duration: fixationMs, response_ends_trial: sensitive, post_trial_gap: 0, data: { ...commonData, role: "delay" as const } },
      {
        type: "html-keyboard-response",
        stimulus: sensitive ? () => (earlyResponse() ? EARLY_RESPONSE_MARKUP : stimulusMarkup(plan)) : stimulusMarkup(plan),
        choices: sensitive ? () => (earlyResponse() ? [] : choices) : choices,
        trial_duration: sensitive ? () => (earlyResponse() ? 900 : responseWindowMs) : responseWindowMs,
        response_ends_trial: true,
        post_trial_gap: itiMs,
        data: { ...commonData, role: "response" as const, responseWindowMs }
      }
    ];
  });
}

/** Loads jsPsych and its plugin. A display element is optional for structural preflight. */
export async function createJsPsychRuntime(timeline: CompiledJsPsychTrial[], options: JsPsychRuntimeOptions = {}) {
  const [{ initJsPsych }, { default: htmlKeyboardResponse }] = await Promise.all([import("jspsych"), import("@jspsych/plugin-html-keyboard-response")]);
  const jsPsych = initJsPsych({ use_webaudio: false, ...(options.displayElement ? { display_element: options.displayElement } : {}), on_trial_finish: options.onTrialFinish ?? (() => undefined) });
  return { jsPsych, timeline: timeline.map((trial) => ({ ...trial, type: htmlKeyboardResponse })) };
}
