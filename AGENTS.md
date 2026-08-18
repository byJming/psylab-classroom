# PsyLab 项目协作说明

本文档用于帮助 AI agent 和贡献者理解 PsyLab 的产品边界、技术约定和验证方式。用户的明确要求优先于本文档；本文档与 `docs/` 冲突时，应先说明冲突并更新相关文档，而不是默默选择一方。

## 项目定位

PsyLab 是面向中国大陆高校心理学教学与公众科学体验的开源、浏览器原生心理实验平台。

产品核心是“可复现的中文课堂实验包”，不是：

- 临床筛查、心理诊断或医疗建议工具。
- IQ、人格、能力排名或“脑龄”测试网站。
- 依赖账号、云端数据库或商业 SaaS 的数据收集平台。
- 任意心理实验的通用可视化拖拽编辑器。

产品有两个入口，但共享同一套实验定义和数据契约：

1. **体验馆**：公众完成低风险经典实验，查看本次任务的描述性指标。
2. **课堂模式**：教师生成会话配置，学生本地完成并导出结果包，教师本地批量导入。

实验发布层级与 P0/P1/P2 技术优先级是两个独立维度：

- `open`：可出现在公众体验馆和课堂模式。
- `guided`：仅通过教师会话运行，必须有教师确认、扩展告知和不可跳过的 debrief。
- `controlled`：保留受控教学/研究实现，不进入公共站点；部署者负责本地伦理、材料和参与者条件。

## 文档优先级

开始实现前先阅读：

1. `README.md`
2. `docs/product-and-scope.md`
3. `docs/architecture.md`
4. `docs/data-contract.md`
5. `docs/experiment-catalog.md`
6. `docs/privacy-and-risk.md`
7. `docs/roadmap-and-quality.md`

机器可读契约位于 `schemas/`。JSON Schema 是结果格式和实验包格式的公共边界；修改 schema 时必须同步更新文档、样例数据、导入器和迁移说明。

## 技术约定

- 技术栈：React、TypeScript、Vite、jsPsych。
- JavaScript 包管理器：优先使用 `pnpm`。
- 实验模型：`Definition / Runner / Metrics`。
- `Definition` 描述元数据、参数 schema、刺激版本和指标声明，不直接操作 DOM。
- 每个 Definition 必须声明 `runPolicy`，包括发布层级、公共目录可见性、教师确认和 debrief 要求。
- `Runner` 负责 jsPsych timeline、预检、预加载、随机种子、生命周期、IndexedDB 和导出。
- `Metrics` 必须是无 DOM、副作用的纯函数；输出原始统计、清洗统计、质量标记和规则版本。
- 实验专属 trial 字段放在 `trial.data`，不得随意污染公共顶层字段。
- `guided` 和 `controlled` 结果包必须保留发布层级；导入器不能把它们与开放体验数据静默混合。
- 原始 trial 数据不可被清洗结果覆盖；所有排除必须有原因并可追溯。
- 默认不使用运行时第三方 CDN、统计脚本、广告、远程字体、摄像头、麦克风或生理传感器。
- MVP 只保证 Chrome/Edge 最新两个大版本的桌面环境；不要宣称实验室设备级时序精度。

## 数据与隐私

- 不将真实姓名、学号、手机号、邮箱、IP、精确设备指纹或健康信息写入结果包。
- 使用匿名参与者代码；不要在代码中建立匿名代码与真实身份的映射。
- 不把真实课堂数据、截图、导出文件或日志提交到仓库。
- 测试只使用合成数据和 `fixtures/` 中的固定样例。
- 结果页面只能描述本次任务表现、条件差异和数据质量，不输出诊断、人格类别、智力等级或医疗建议。
- 新增量表、词表、图像、音频或字体前必须核验许可并记录到实验包的 `LICENSES.md`。

## 新增实验的最小要求

新增或修改实验时，必须同时更新：

- 实验 Definition 和参数 schema。
- `docs/experiment-catalog.md` 的优先级、风险和限制。
- 实验目的、理论背景、变量和中文说明。
- 刺激来源、许可和版本信息。
- 固定随机种子样例。
- Metrics 单元测试，包括正常、缺失响应、全错、重复和失焦场景。
- 结果代码本和导出字段说明。

默认优先选择无敏感内容、无欺骗、无生理采集、可程序化生成刺激的低风险实验。临床筛查、身份态度、情绪诱发、财务决策、赌博、强刺激和专用硬件范式不进入普通实验池。

需要 surprise manipulation、轻度欺骗或课堂讨论的实验可以进入 `guided` 层；涉及身份、负性情绪、社会排斥、临床暗示、专用硬件或高精度时序的实验只能评估为 `controlled` 或不纳入官方实现。

## 修改流程

1. 先阅读相关文档和相邻代码，确认现有契约。
2. 将公共行为变化记录在文档或 ADR 中。
3. 保持改动聚焦，不顺手重构无关模块。
4. 为行为变化补充最小充分测试；数据契约变化必须补充 round-trip 测试。
5. 验证类型检查、单元测试、构建和受影响的浏览器流程。
6. 汇报实际运行过的命令和未执行的验证，不虚构结果。

## 测试产物与磁盘空间管理

测试期间会产生不少可重建文件。及时清理这些文件不会降低项目质量，因为质量依赖源代码、lockfile、测试夹具、提交的回归快照和可重复的测试命令，而不是临时输出目录。

### 可以清理的临时产物

以下目录通常可以在确认测试进程已结束、且失败报告已查看后删除：

- `node_modules/.cache/`
- `.vite/`、`.cache/`
- `coverage/`
- `playwright-report/`
- `test-results/`
- 未提交的 `dist/`
- 临时截图、录屏、调试日志和本地导出结果

Playwright 浏览器二进制也可以在不做浏览器测试的阶段卸载，之后按锁定版本重新安装。删除它不会改变项目源代码或测试逻辑，只会增加下一次测试的下载时间。

### 不要当作缓存删除的文件

- `pnpm-lock.yaml`、`package.json` 和其他依赖锁定文件。
- `fixtures/` 中的合成数据、固定随机种子输入和预期输出。
- 已提交的视觉回归快照、实验刺激和 `LICENSES.md`。
- `schemas/`、`docs/`、ADR 和迁移说明。
- 任何尚未核对的失败测试报告。

### 推荐的 PowerShell 清理方式

只对明确的项目目录执行清理，并先确认路径；不要使用面向工作区根目录的递归删除命令。

```powershell
$temporaryPaths = @(
  'node_modules/.cache',
  '.vite',
  '.cache',
  'coverage',
  'playwright-report',
  'test-results',
  'dist'
)

foreach ($temporaryPath in $temporaryPaths) {
  $resolvedPath = Join-Path (Get-Location) $temporaryPath
  if (Test-Path -LiteralPath $resolvedPath) {
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
  }
}
```

`pnpm store` 是跨项目共享缓存。只有在确认磁盘空间紧张时才运行 `pnpm store prune`；它不会损坏项目，但会使后续安装重新下载依赖。不要为了清理缓存删除 lockfile 或修改依赖版本。

## 验证最低线

在实现阶段，至少应覆盖：

- JSON Schema 可解析。
- Definition → Runner → Result Bundle 的基本闭环。
- JSON 导出再导入 round-trip。
- Metrics 对固定样例输出稳定结果。
- Chrome/Edge Windows 桌面运行。
- 刷新恢复、存储不可用、失焦和中途退出。
- 中文长文案、键盘布局、色觉提示和导出编码。

测试缓存可以清理，质量证据不能清理。清理后仍应能通过锁定依赖、固定 fixtures 和公开命令完整重建测试结果。
