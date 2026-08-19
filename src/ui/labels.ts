import type { Tier } from "../types";

export const tierLabels: Record<Tier, string> = { open: "开放体验", guided: "课堂引导", controlled: "受控层" };
export const statusLabels: Record<string, string> = { alpha: "内测", beta: "测试版", stable: "稳定版" };

export function tierStatusLabel(tier: string, status?: string): string {
  const tierLabel = tierLabels[tier as Tier] ?? tier;
  return status ? `${tierLabel} · ${statusLabels[status] ?? status}` : tierLabel;
}

const conditionLabels: Record<string, string> = {
  target: "目标",
  congruent: "颜色一致",
  incongruent: "颜色冲突",
  go: "Go · 圆形",
  "no-go": "No-Go · 方形",
  compatible: "位置相容",
  incompatible: "位置冲突"
  ,valid: "有效线索"
  ,invalid: "无效线索"
  ,neutral: "中性线索"
  ,signal: "有信号"
  ,noise: "无信号"
  ,repeat: "规则重复"
  ,switch: "规则切换"
  ,"1-back": "1-back"
  ,"2-back": "2-back"
};

const flankerConditionLabels: Record<string, string> = { congruent: "方向一致", incongruent: "方向冲突" };

/** 把导出的原始条件 id 翻译成面向被试和教师的中文标签。 */
export function conditionLabel(experimentId: string, condition: string): string {
  if (experimentId === "flanker" && flankerConditionLabels[condition]) return flankerConditionLabels[condition];
  if (conditionLabels[condition]) return conditionLabels[condition];
  const rotation = /^(same|mirror)-(\d+)$/.exec(condition);
  if (rotation) return `${rotation[1] === "same" ? "同形" : "镜像"} · ${rotation[2]}°`;
  const choice = /^set-(\d+)$/.exec(condition);
  if (choice) return `${choice[1]} 选 1`;
  const search = /^(feature|conjunction)-(\d+)$/.exec(condition);
  if (search) return `${search[1] === "feature" ? "特征搜索" : "结合搜索"} · ${search[2]} 项`;
  return condition;
}

export const qualityFlagLabels: Record<string, string> = { interrupted: "中途退出", "focus-loss": "页面曾失焦", "low-accuracy": "正确响应较少", "no-valid-test-trials": "有效正式试次不足", "debrief-completed": "已完成事后说明" };

export const viewportBucketLabels: Record<string, string> = { large: "大屏", medium: "中屏", small: "小屏", unknown: "未知" };
