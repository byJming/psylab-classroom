import { chromium } from "playwright-core";
import { createHash } from "node:crypto";

const baseUrl = process.env.PSYLAB_URL ?? "http://127.0.0.1:5173/";
const chrome = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

function manifestFor(experimentId, config, index) {
  const configHash = `sha256:${createHash("sha256").update(canonicalize(config)).digest("hex")}`;
  const definitionVersion = ["posner-cueing", "signal-detection", "task-switching"].includes(experimentId) ? "1.0.0" : "1.1.0";
  return { format: "psylab-session", formatVersion: "1.0", experimentId, definitionVersion, distributionTier: "open", runPolicyVersion: "1.0.0", config, configHash, sessionId: `p0-${index}-${experimentId}`, createdAt: "2026-08-18T00:00:00.000Z" };
}

// 回归：jsPsych 的 run() 只追加内容容器；实验过程中 DOM 节点数、页面高度与滚动位置不得随按键增长。
async function assertNoDomGrowth(page) {
  const state = await page.evaluate(() => ({
    wrappers: document.querySelectorAll(".jspsych-content-wrapper").length,
    contents: document.querySelectorAll("#jspsych-content").length,
    height: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollY: Math.round(window.scrollY)
  }));
  if (state.wrappers > 1) throw new Error(`jspsych wrapper leaked: ${state.wrappers}`);
  if (state.contents > 1) throw new Error(`duplicate #jspsych-content: ${state.contents}`);
  if (state.height > state.innerHeight * 1.3) throw new Error(`page height grew unexpectedly: ${state.height}`);
  if (state.scrollY !== 0) throw new Error(`page scrolled away during run: ${state.scrollY}`);
}

const cases = [
  { id: "simple-rt", config: { practiceTrials: 2, testTrials: 8 }, key: "Space", delay: 1300 },
  { id: "stroop-color-word", config: { practiceTrials: 4, testTrials: 16 }, key: "f", delay: 350 },
  { id: "go-no-go", config: { practiceTrials: 4, testTrials: 20, goRatio: 0.7 }, key: "Space", delay: 350 },
  { id: "mental-rotation", config: { practiceTrials: 4, testTrials: 16 }, key: "f", delay: 350 },
  { id: "choice-rt", config: { practiceTrials: 4, testTrials: 24 }, key: "f", delay: 350 },
  { id: "flanker", config: { practiceTrials: 4, testTrials: 24 }, key: "f", delay: 350 },
  { id: "simon", config: { practiceTrials: 4, testTrials: 24 }, key: "f", delay: 350 },
  { id: "visual-search", config: { practiceTrials: 4, testTrials: 32 }, key: "j", delay: 400 },
  { id: "posner-cueing", config: { practiceTrials: 6, testTrials: 18 }, key: "f", delay: 400 },
  { id: "signal-detection", config: { practiceTrials: 8, testTrials: 24 }, key: "f", delay: 400 },
  { id: "n-back", config: { practiceTrials: 8, testTrials: 24 }, key: "f", delay: 400 },
  { id: "task-switching", config: { practiceTrials: 8, testTrials: 24 }, key: "f", delay: 400 }
];

for (const [index, item] of cases.entries()) {
  const manifest = manifestFor(item.id, item.config, index);
  await page.goto(`${baseUrl}#/run/${Buffer.from(JSON.stringify(manifest)).toString("base64")}`, { waitUntil: "networkidle" });
  // 预检可能瞬间完成（模块已缓存时加载很快），不能依赖瞬态的“正在检查”文案；等待稳定的就绪按钮。
  await page.getByRole("button", { name: "继续阅读说明 →" }).waitFor();
  await page.getByRole("button", { name: "继续阅读说明 →" }).click();
  await page.locator("#participant-code-input").fill(`p0-${index + 1}`);
  await page.getByRole("button", { name: "开始练习 →" }).click();
  await page.getByText("练习阶段", { exact: true }).waitFor();
  // 按键节奏不再与试次一一对应（注视期按键会被记为提前反应），因此循环直到任务完成，
  // 途中自动点击“开始正式测试”过渡屏，并周期性断言 DOM/高度不增长。
  const deadline = Date.now() + 180000;
  let growthChecks = 0;
  while (Date.now() < deadline) {
    if (await page.getByText("任务完成").count()) break;
    const beginTest = page.getByRole("button", { name: "开始正式测试 →" });
    if (await beginTest.count()) { await beginTest.click(); await assertNoDomGrowth(page); continue; }
    await page.keyboard.press(item.key);
    await page.waitForTimeout(item.delay);
    growthChecks += 1;
    if (growthChecks % 5 === 0) await assertNoDomGrowth(page);
  }
  await page.getByText("任务完成").waitFor({ timeout: 30000 });
  await assertNoDomGrowth(page);
  await page.getByRole("button", { name: "查看结果 →" }).click();
  await page.getByRole("heading", { name: "这是本次任务的结果" }).waitFor();
}

if (pageErrors.length) throw new Error(`browser errors: ${pageErrors.join(" | ")}`);
await browser.close();
console.log("p0 browser closure passed: 12 experiments");
