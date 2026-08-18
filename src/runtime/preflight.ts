import type { ExperimentDefinition, PreflightResult } from "../types";

const blockingCheckIds = new Set(["keyboard", "viewport", "visibility", "resource"]);

/** IndexedDB can degrade to memory, but an unavailable input, desktop viewport, page, or resource cannot run a valid task. */
export function canStartPreflight(checks: PreflightResult["checks"]): boolean {
  return checks.filter((check) => blockingCheckIds.has(check.id)).every((check) => check.ok);
}

export async function runPreflight(definition?: ExperimentDefinition): Promise<PreflightResult> {
  const checks: PreflightResult["checks"] = [];
  const keyboard = typeof window !== "undefined" && "onkeydown" in window;
  checks.push({ id: "keyboard", label: "键盘输入", ok: keyboard, detail: keyboard ? "检测到键盘事件支持" : "当前环境不支持键盘事件" });
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewport = viewportWidth >= 800;
  checks.push({ id: "viewport", label: "桌面视口", ok: viewport, detail: viewport ? `${viewportWidth}px，可进行键盘实验` : `${viewportWidth}px，建议使用桌面浏览器` });
  const visible = typeof document === "undefined" || document.visibilityState === "visible";
  checks.push({ id: "visibility", label: "页面可见", ok: visible, detail: visible ? "页面当前可见" : "页面当前处于后台" });
  let storage = false;
  try { storage = typeof indexedDB !== "undefined"; if (storage) await new Promise<void>((resolve) => { const request = indexedDB.open("psylab-preflight", 1); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => resolve(); }); } catch { storage = false; }
  checks.push({ id: "storage", label: "本地存储", ok: storage, detail: storage ? "IndexedDB 可用，将保存断点" : "IndexedDB 不可用，将使用临时内存，刷新可能丢失" });
  const resource = await preloadResources(definition);
  checks.push({ id: "resource", label: "本地资源", ok: resource, detail: resource ? (definition?.stimuli?.mode === "procedural" ? "程序化刺激已准备，无需远程资源" : "应用资源加载正常") : "资源加载检查失败" });
  return { ok: checks.every((check) => check.ok), canStart: canStartPreflight(checks), checks };
}

async function checkResource(): Promise<boolean> {
  try { const response = await fetch(import.meta.env.BASE_URL, { cache: "no-store" }); return response.ok; } catch { return false; }
}

export async function preloadResources(definition?: ExperimentDefinition): Promise<boolean> {
  if (definition?.stimuli?.mode === "procedural") return checkResource();
  return checkResource();
}

export function browserFamily(): "Chromium" | "Firefox" | "Safari" | "Other" | "Unknown" {
  if (typeof navigator === "undefined") return "Unknown"; const ua = navigator.userAgent;
  if (/Edg|Chrome|Chromium/i.test(ua)) return "Chromium"; if (/Firefox/i.test(ua)) return "Firefox"; if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari"; return "Other";
}
export function platformFamily(): "Windows" | "macOS" | "Linux" | "Android" | "iOS" | "Other" | "Unknown" {
  if (typeof navigator === "undefined") return "Unknown"; const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows"; if (/Mac OS/i.test(ua)) return "macOS"; if (/Android/i.test(ua)) return "Android"; if (/iPhone|iPad/i.test(ua)) return "iOS"; if (/Linux/i.test(ua)) return "Linux"; return "Other";
}
export function viewportBucket(): "small" | "medium" | "large" | "unknown" { const width = typeof window === "undefined" ? 0 : window.innerWidth; return width >= 1200 ? "large" : width >= 800 ? "medium" : width > 0 ? "small" : "unknown"; }
