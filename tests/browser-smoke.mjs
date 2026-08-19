import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const baseUrl = process.env.PSYLAB_URL ?? "http://127.0.0.1:5173/";
const chrome = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const downloadNames = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("download", (download) => downloadNames.push(download.suggestedFilename()));

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByText("选择一个现象开始探索").waitFor();
for (const title of ["Simple RT 简单反应时", "颜色词 Stroop", "Go/No-Go 响应抑制", "Mental Rotation 心理旋转"]) await page.getByText(title).waitFor();
await page.locator(".experiment-card", { hasText: "Simple RT 简单反应时" }).click();
await page.getByRole("heading", { name: "理论背景与机制" }).waitFor();
if (await page.evaluate(() => window.scrollY) !== 0) throw new Error("route navigation must restore the page scroll position");
await page.getByText("自变量").waitFor();
await page.getByRole("button", { name: "返回实验馆" }).click();

const savedResult = JSON.parse(await readFile("fixtures/results/stroop-valid.json", "utf8"));
await page.evaluate(async (result) => new Promise((resolve, reject) => { const request = indexedDB.open("psylab-local", 2); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("runs")) request.result.createObjectStore("runs"); if (!request.result.objectStoreNames.contains("results")) request.result.createObjectStore("results"); }; request.onerror = () => reject(request.error); request.onsuccess = () => { const tx = request.result.transaction("results", "readwrite"); tx.objectStore("results").put(result, "latest"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }; }), savedResult);
await page.goto(`${baseUrl}#/results`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "这是本次任务的结果" }).waitFor();
await page.getByText("大众读法", { exact: true }).waitFor();
await page.getByRole("heading", { name: "颜色冲突影响" }).waitFor();
await page.getByRole("heading", { name: "按条件查看" }).waitFor();
await page.locator(".submit-guide").waitFor();
if (!(await page.locator(".submit-guide code").textContent())?.startsWith("psylab-result-")) throw new Error("submit guide must preview the result filename");
await page.getByRole("button", { name: "下载结果文件（JSON）" }).click();
await page.waitForTimeout(300);
if (!downloadNames.some((name) => name.startsWith("psylab-result-"))) throw new Error("missing export download: psylab-result-");
await page.getByRole("button", { name: "导出 CSV 与代码本" }).click();
await page.waitForTimeout(300);
for (const expected of ["psylab-trials-", "psylab-summary-", "psylab-codebook-"]) if (!downloadNames.some((name) => name.startsWith(expected))) throw new Error(`missing export download: ${expected}`);
await page.getByRole("button", { name: "体验馆", exact: true }).click();

await page.getByRole("button", { name: "课堂会话", exact: true }).click();
await page.getByRole("heading", { name: "创建一个可复现会话" }).waitFor();
await page.getByRole("button", { name: "生成会话配置" }).click();
await page.getByText("配置已生成").waitFor();
await page.getByText("配置哈希：").waitFor();
const sessionLink = await page.locator(".session-link").textContent();
const manifestPayload = JSON.parse(Buffer.from(sessionLink.split("/run/").at(-1), "base64").toString("utf8"));
if ("participantCode" in manifestPayload.config) throw new Error("shared session manifest must not contain a participant code");

await page.getByRole("button", { name: "教师导入" }).click();
await page.getByRole("heading", { name: "本地批量导入" }).waitFor();
// 单一入口：会话与结果文件混在一起一次拖入，按 format 自动识别。
await page.locator('input[type="file"]').nth(0).setInputFiles(["fixtures/sessions/stroop-session.json", "fixtures/results/stroop-valid.json"]);
await page.getByText("已识别课堂会话").waitFor();
// 严格断言通过数：旧断言“1”.first() 会匹配错误计数，掩盖 fixture 不匹配导致的假阳性。
await page.getByText("个文件通过").waitFor();
const passedCount = await page.locator(".report-summary div b").first().textContent();
if (passedCount !== "1") throw new Error(`expected 1 accepted bundle, got ${passedCount}`);
// 参与者明细可在浏览器内展开查看，无需下载。
await page.locator(".bundle-row summary").first().click();
await page.locator(".bundle-detail").first().waitFor();

await page.getByRole("button", { name: "体验馆", exact: true }).click();
await page.getByRole("button", { name: /开始体验/ }).click();
await page.getByRole("button", { name: "开始实验 →" }).click();
// 预检可能瞬间完成，不能依赖瞬态的“正在检查”文案；由后续 check-row / preflight-complete 断言覆盖。
const jsPsychCheck = page.locator(".check-row", { hasText: "jsPsych 时间线" });
await jsPsychCheck.waitFor();
if (!await jsPsychCheck.evaluate((element) => element.classList.contains("ok"))) throw new Error("jsPsych timeline preflight did not pass");
if (await page.locator(".loader").count()) throw new Error("preflight loader must stop after checks complete");
await page.locator(".preflight-complete").waitFor();
await page.getByRole("button", { name: "继续阅读说明 →" }).click();
await page.getByText("匿名参与者代码（可选）").waitFor();
if (await page.locator("#participant-code-input").inputValue()) throw new Error("participant code must be optional");
await page.getByRole("button", { name: "开始练习 →" }).click();
await page.waitForTimeout(1300);
await page.keyboard.press("Space");
await page.waitForTimeout(100);
// 回归：jsPsych 运行时不得随试次堆积内容容器（页面高度无限增长缺陷）。
const wrapperCount = await page.evaluate(() => document.querySelectorAll(".jspsych-content-wrapper").length);
if (wrapperCount > 1) throw new Error(`jspsych runtime must not stack display containers: ${wrapperCount}`);
// 提前按键会被记为 anticipation 并在反馈窗（约 900ms）后才写入草稿，因此轮询等待首个草稿出现。
const generatedParticipantCode = await page.evaluate(async () => {
  const readLatest = () => new Promise((resolve, reject) => { const request = indexedDB.open("psylab-local", 2); request.onerror = () => reject(request.error); request.onsuccess = () => { const tx = request.result.transaction("runs", "readonly"); const get = tx.objectStore("runs").getAll(); get.onsuccess = () => resolve(get.result.at(-1)?.participantCode ?? null); get.onerror = () => reject(get.error); }; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await readLatest();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
});
if (!String(generatedParticipantCode).startsWith("anon-")) throw new Error("empty participant code must generate an anonymous code");
if (!await page.locator(".runner-page").evaluate((element) => element.classList.contains("runner-simple-rt"))) throw new Error("runner must expose its experiment theme");
await page.reload({ waitUntil: "networkidle" });
await page.getByText("练习阶段").waitFor();
await page.getByRole("button", { name: "退出实验" }).click();
await page.getByRole("heading", { name: "结束本次任务？" }).waitFor();
await page.getByRole("button", { name: "保存中断结果" }).click();
await page.getByRole("heading", { name: "这是本次任务的结果" }).waitFor();
await page.locator(".quality-panel").getByText(/中途退出/).waitFor();

const restoreConfig = { practiceTrials: 4, testTrials: 24 };
const restoreConfigHash = `sha256:${createHash("sha256").update(JSON.stringify(restoreConfig)).digest("hex")}`;
const restoreManifest = { format: "psylab-session", formatVersion: "1.0", experimentId: "stroop-color-word", definitionVersion: "1.1.0", distributionTier: "open", runPolicyVersion: "1.0.0", config: restoreConfig, configHash: restoreConfigHash, sessionId: "restore-session-01", createdAt: "2026-08-18T00:00:00.000Z" };
const restoreTrials = Array.from({ length: 28 }, (_, index) => ({ ...savedResult.trials[index % savedResult.trials.length], trialIndex: index, phase: index < 4 ? "practice" : "test" }));
const restoreResult = { ...savedResult, experiment: { ...savedResult.experiment, configHash: restoreConfigHash }, session: { ...savedResult.session, sessionId: restoreManifest.sessionId, attemptId: "restore-attempt-01" }, trials: restoreTrials };
const restoreDraft = { manifest: restoreManifest, participantCode: restoreResult.session.participantCode, attemptId: restoreResult.session.attemptId, randomSeed: restoreResult.session.randomSeed, trials: restoreTrials, focusLossCount: 0, focusLossTotal: 0, fullscreenExitCount: 2, storageRecoveryUsed: false };
await page.evaluate(async ({ draft, result }) => new Promise((resolve, reject) => { const request = indexedDB.open("psylab-local", 2); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; const tx = db.transaction(["runs", "results"], "readwrite"); tx.objectStore("runs").put(draft, `draft:${draft.manifest.sessionId}`); tx.objectStore("results").put(result, "latest"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }; }), { draft: restoreDraft, result: restoreResult });
await page.goto(`${baseUrl}#/run/${Buffer.from(JSON.stringify(restoreManifest)).toString("base64")}`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "你的结果已准备好" }).waitFor();
await page.getByRole("button", { name: "查看结果 →" }).click();
await page.getByRole("heading", { name: "这是本次任务的结果" }).waitFor();

const timeoutContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const timeoutPage = await timeoutContext.newPage();
await timeoutPage.goto(baseUrl, { waitUntil: "networkidle" });
await timeoutPage.getByRole("button", { name: /开始体验/ }).click();
await timeoutPage.getByRole("button", { name: "开始实验 →" }).click();
await timeoutPage.getByRole("button", { name: "继续阅读说明 →" }).click();
await timeoutPage.locator("#participant-code-input").fill("browser-timeout");
await timeoutPage.getByRole("button", { name: "开始练习 →" }).click();
await timeoutPage.waitForTimeout(3900);
await timeoutPage.getByText("2 / 3").waitFor();
await timeoutContext.close();

const storageContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await storageContext.addInitScript(() => Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined }));
const storagePage = await storageContext.newPage();
await storagePage.goto(baseUrl, { waitUntil: "networkidle" });
await storagePage.getByRole("button", { name: /开始体验/ }).click();
await storagePage.getByRole("button", { name: "开始实验 →" }).click();
await storagePage.getByText("IndexedDB 不可用，将使用临时内存，刷新可能丢失").waitFor();
await storageContext.close();

const resourceContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const resourcePage = await resourceContext.newPage();
await resourcePage.goto(baseUrl, { waitUntil: "networkidle" });
await resourceContext.setOffline(true);
await resourcePage.getByRole("button", { name: /开始体验/ }).click();
await resourcePage.getByRole("button", { name: "开始实验 →" }).click();
await resourcePage.getByText("资源加载检查失败").waitFor();
if (!await resourcePage.getByRole("button", { name: "继续阅读说明 →" }).isDisabled()) throw new Error("resource preload failure must block the run");
await resourceContext.setOffline(false);
await resourceContext.close();

if (pageErrors.length) throw new Error(`browser errors: ${pageErrors.join(" | ")}`);
await browser.close();
console.log("browser smoke passed");
