import { shuffle } from "../core/hash";

/** Stable, procedural geometry used by the Mental Rotation task. */
export const mentalRotationShapePath = "M 12 12 H 46 V 28 H 30 V 68 H 12 Z";

/**
 * Both shapes rotate away from upright by ±angle/2, so the judged angular
 * difference is `angle` while neither side stays at a familiar 0° baseline.
 * The viewBox leaves headroom so rotated corners are never clipped.
 */
export function mentalRotationSvgMarkup(angle: number, same: boolean): string {
  const safeAngle = Number.isFinite(angle) ? angle : 0;
  const half = Math.round((safeAngle / 2) * 10) / 10;
  return `<svg class="mental-rotation-svg" viewBox="0 0 300 120" role="img" aria-label="两组程序化几何图形"><g transform="translate(34 26) rotate(${-half} 29 40)"><path d="${mentalRotationShapePath}"/></g><g transform="translate(230 26) ${same ? "" : "scale(-1 1)"}rotate(${half} 29 40)"><path d="${mentalRotationShapePath}"/></g></svg>`;
}

function safeColor(value: unknown): string {
  const color = String(value ?? "#1f2933");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#1f2933";
}

/** Choice RT 的彩色圆形目标；颜色即作答依据。 */
export function choiceCircleMarkup(color: unknown): string {
  return `<div class="measured-circle choice-circle" style="background:${safeColor(color)}" aria-hidden="true"></div>`;
}

/** Flanker 五箭头阵列；中央箭头是目标，两侧是干扰物，全部同色避免特征弹出。 */
export function flankerArrowsMarkup(targetLeft: boolean, compatible: boolean): string {
  const target = targetLeft ? "←" : "→";
  const flanker = compatible ? target : (targetLeft ? "→" : "←");
  const arrows = [flanker, flanker, target, flanker, flanker];
  return `<div class="measured-flanker" role="img" aria-label="五个箭头组成的阵列">${arrows.map((arrow, index) => `<span class="${index === 2 ? "target" : "flank"}">${arrow}</span>`).join("")}</div>`;
}

/** Simon 的偏心彩色圆形；位置不是作答依据，但固定偏移保证空间相容性可被观察。 */
export function simonCircleMarkup(positionLeft: boolean, color: unknown): string {
  return `<div class="measured-simon ${positionLeft ? "left" : "right"}" aria-hidden="true"><div class="measured-circle" style="background:${safeColor(color)}"></div></div>`;
}

/** 视觉搜索的固定槽位：4 项用对角线，8 项再加正交方向；物品分配由 stimulusId 种子决定。 */
const SEARCH_SLOT_DEGREES = [45, 135, 225, 315, 0, 90, 180, 270];
const SEARCH_RED = "#d94841";
const SEARCH_GREEN = "#2f9e44";

type SearchItem = "target" | "red-square" | "green-circle";

export function visualSearchSvgMarkup(stimulusId: string, searchType: string, setSize: number, targetPresent: boolean): string {
  const size = setSize === 8 ? 8 : 4;
  const items: SearchItem[] = [];
  if (targetPresent) items.push("target");
  let toggle = 0;
  while (items.length < size) {
    // 特征搜索的干扰物只有一种；结合搜索用红方块与绿圆圈交替，目标需要结合颜色与形状两个特征。
    items.push(searchType === "feature" ? "green-circle" : (toggle += 1) % 2 === 1 ? "red-square" : "green-circle");
  }
  const slots = SEARCH_SLOT_DEGREES.slice(0, size);
  const orderedItems = shuffle(items, `${stimulusId}-items`);
  const orderedSlots = shuffle(slots, `${stimulusId}-slots`);
  const shapes = orderedItems.map((item, index) => {
    const degrees = orderedSlots[index]! * (Math.PI / 180);
    const cx = Math.round((180 + 118 * Math.cos(degrees)) * 10) / 10;
    const cy = Math.round((180 + 118 * Math.sin(degrees)) * 10) / 10;
    if (item === "red-square") return `<rect x="${cx - 20}" y="${cy - 20}" width="40" height="40" fill="${SEARCH_RED}"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="20" fill="${item === "green-circle" ? SEARCH_GREEN : SEARCH_RED}"/>`;
  }).join("");
  return `<svg class="visual-search-svg" viewBox="0 0 360 360" role="img" aria-label="一组程序化搜索陈列">${shapes}</svg>`;
}

export function posnerCueMarkup(cueType: string, cuePosition?: string): string {
  const cue = cueType === "neutral" ? "＋" : cuePosition === "left" ? "←" : cuePosition === "right" ? "→" : "◇";
  return `<div class="posner-cue ${cueType}" aria-label="空间线索">${cue}</div>`;
}

export function posnerTargetMarkup(position: string): string {
  return `<div class="posner-target ${position === "left" ? "left" : "right"}" aria-label="目标位置"><div class="measured-circle posner-target-dot"></div></div>`;
}

export function signalDetectionMarkup(signalPresent: boolean): string {
  const texture = signalPresent ? "signal" : "noise";
  return `<div class="signal-detection-stimulus ${texture}" aria-label="${signalPresent ? "有信号" : "无信号"}"><span></span></div>`;
}

export function taskSwitchingMarkup(rule: string, colorName: string, shape: string): string {
  const color = colorName === "red" ? "#d94841" : "#1971c2";
  const shapeMarkup = shape === "circle" ? `<circle cx="60" cy="60" r="38" fill="${color}"/>` : `<rect x="22" y="22" width="76" height="76" fill="${color}"/>`;
  return `<div class="task-switch-stimulus"><span class="task-switch-rule">${rule === "color" ? "颜色" : "形状"}</span><svg viewBox="0 0 120 120" aria-label="${colorName === "red" ? "红色" : "蓝色"}${shape === "circle" ? "圆形" : "方形"}">${shapeMarkup}</svg></div>`;
}
