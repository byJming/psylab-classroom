# PsyLab

把经典心理实验带进真实课堂，也交给每一份好奇心。

**在线体验：[byjming.github.io/psylab-classroom](https://byjming.github.io/psylab-classroom/)**（推荐桌面 Chrome / Edge 最新两个大版本，配实体键盘）

PsyLab 是面向中国大陆高校心理学教学与公众科学体验的开源、浏览器原生心理实验平台：打开网页即可运行经典实验，完成练习与正式试次，查看本次任务的描述性指标，并带走可导入的本地结果包。

![PsyLab 首页：实验目录优先展示，八个开放层实验一目了然](docs/images/home.png)

---

## 这个平台能做什么

- **体验馆**：公众选择一个经典实验，几分钟完成，结果只描述本次任务表现。
- **课堂模式**：教师生成本地会话配置分发给学生；学生在自己浏览器完成实验并下载结果包；教师在本地批量导入、校验与汇总。
- **实验包仓库**：每个实验都公开定义（Definition）、参数 schema、程序化刺激、指标说明、许可清单和固定随机种子样例，可复现、可审阅。

## 当前实验目录

八个 `open / beta` 官方实验，全部使用程序化原创刺激、中文说明、描述性结果；实验目录会定期扩充更新，候选范式与筛选标准见 [实验目录与筛选标准](docs/experiment-catalog.md)。

| 实验 | 观察的现象 | 主要指标 | 预计用时 |
|---|---|---|---|
| Simple RT 简单反应时 | 反应速度与试次波动 | 中位数反应时、离散度 | 3–8 分钟 |
| Choice RT 选择反应时 | 选择数量对反应时的影响 | 2 选 1 / 4 选 1 条件差 | 4–10 分钟 |
| 颜色词 Stroop | 刺激维度冲突 | 冲突效应、正确率 | 5–12 分钟 |
| Flanker 侧抑制 | 周边干扰与选择反应 | 一致/不一致差值 | 4–10 分钟 |
| Simon 空间相容性 | 位置与反应规则冲突 | Simon 效应 | 4–10 分钟 |
| Go/No-Go 响应抑制 | 响应抑制 | 命中率、虚报率 | 5–12 分钟 |
| Visual Search 视觉搜索 | 特征与结合搜索 | 搜索斜率、正确率 | 5–12 分钟 |
| Mental Rotation 心理旋转 | 空间旋转判断 | 角度斜率、正确率 | 5–12 分钟 |

## 快速体验（学生 / 公众）

1. 打开站点，在首页实验目录选择一个感兴趣的实验，进入详情页。
2. 阅读实验说明、理论与按键规则，点击"开始实验"。
3. 先完成带反馈的**练习阶段**（不计入摘要），再进入**正式阶段**。
4. 完成后查看结果页：一个面向公众的主指标、按条件的详细统计、数据质量标记。
5. 需要提交时，下载 `.json` 结果文件（教师可再导入校验），或自行导出 CSV 与代码本。

![实验详情页：中文说明、变量设计与按键规则在开始前列明](docs/images/detail.png)

*详情页在开始前说明理论背景、自变量/因变量、按键规则和预计用时；色觉相关任务另有提示。*

![运行中的 Flanker 任务：只需判断中央箭头方向，忽略两侧干扰](docs/images/runner.png)

*运行界面：注视点 → 刺激 → 响应窗的固定节奏；练习阶段有逐次反馈，正式阶段无提示。*

![结果页：公众主指标 + 条件级统计 + 质量标记](docs/images/results.png)

*结果页只描述本次任务表现；原始 trial、清洗规则与版本号随结果包导出。*

## 课堂使用（教师教程）

### 第 1 步：创建课堂会话

进入"课堂会话"页，选择实验、设置练习与正式 trial 数，生成会话配置。页面提供可复制的会话链接和 `.psylab-session.json` 会话文件；配置哈希（configHash）随会话固定，保证全班使用同一套参数。

![课堂会话页：选择实验与参数，一键生成会话链接或文件](docs/images/classroom.png)

### 第 2 步：分发给学生

把会话链接或会话文件发给学生。学生在自己的浏览器打开链接，填写**匿名参与者代码**（不要求姓名学号）后开始实验。中途退出会自动保存草稿，下次打开可继续。

### 第 3 步：回收结果

学生完成后下载各自的 `.json` 结果文件，通过班级既有渠道（网盘、邮件、U 盘等）交回。

### 第 4 步：本地批量导入

进入"教师导入"页，把会话文件和全部学生结果一起拖入。导入器在**本地**完成：

- 校验格式、Definition/指标/分析规则版本、发布层级与配置哈希；
- 用固定随机种子重建试次计划，拦截结构或程序化字段被篡改的文件；
- 逐试次复核 correct、排除标记与响应窗边界；
- 拦截重复提交与混合实验，提醒同一参与者的多次尝试；
- 生成批量 trial CSV、参与者摘要 CSV、代码本和错误报告。

![教师导入页：会话与结果一次拖入，本地校验并导出汇总](docs/images/import.png)

## 数据与隐私

- 数据默认留在完成实验的浏览器（IndexedDB），导出为本地文件。
- 使用匿名参与者代码；请勿在代码中填写真实身份信息。
- 结果包不包含姓名、学号、IP、设备指纹或健康信息。
- 详见 [隐私、合规与风险](docs/privacy-and-risk.md)。

## 部署

PsyLab 是纯静态站点：`pnpm build` 后将 `dist/` 原样发布即可，支持 GitHub Pages（仓库自带 workflow）、Cloudflare Pages、高校静态服务器或离线镜像。详见 [静态部署](docs/deployment.md)。

## 本地开发

需要 Node.js 20+ 与 pnpm：

```bash
pnpm install
pnpm dev          # http://localhost:5173/
```

验证命令：

```bash
pnpm typecheck    # TypeScript 类型检查
pnpm lint         # ESLint
pnpm test         # Vitest 单元测试（契约、确定性、指标、导入校验）
pnpm build        # 类型检查 + 生产构建
```

技术栈为 React + TypeScript + Vite + jsPsych，实验采用统一的 `Definition / Runner / Metrics` 模型；机器可读契约位于 `schemas/`。新增实验的最小要求与验收清单见 [AGENTS.md](AGENTS.md) 与 [实验目录与筛选标准](docs/experiment-catalog.md)。

## 文档

- [产品与范围](docs/product-and-scope.md) · [技术架构](docs/architecture.md) · [数据契约](docs/data-contract.md)
- [实验目录与筛选标准](docs/experiment-catalog.md) · [实验包格式](docs/experiment-package-format.md)
- [隐私、合规与风险](docs/privacy-and-risk.md) · [路线图与质量门槛](docs/roadmap-and-quality.md)
- [静态部署](docs/deployment.md) · [数据迁移说明](docs/migrations.md) · [课程试用记录模板](docs/course-trial-feedback-template.md)
- Schema：[实验定义](schemas/experiment-definition.schema.json) · [会话清单](schemas/session-manifest.schema.json) · [结果包](schemas/result-bundle.schema.json)
- [贡献指南与 DCO](CONTRIBUTING.md)

## 边界声明

- 发布层级与技术优先级分离：`open`（公众与课堂）、`guided`（需教师确认与 debrief）、`controlled`（受控部署）。当前官方目录仅包含 `open` 层实验。
- 不纳入临床筛查、诊断、强刺激、摄像头/麦克风/生理采集与许可不清的材料。
- 浏览器反应时受设备与输入延迟影响，不用于跨设备排名；不宣称实验室设备级时序精度。

## 许可

- 代码：[Apache-2.0](LICENSE)
- 教学文档与实验说明：CC BY 4.0
- 原创程序化刺激与样例数据：CC0 或各实验 `LICENSES.md` 中单独声明的宽松许可
- 第三方材料必须保留来源、许可与版本信息，不因进入仓库而自动获得开源许可

贡献须遵守 [DCO](CONTRIBUTING.md#developer-certificate-of-origin)，不得提交真实课堂数据、个人信息或未经许可的材料。
