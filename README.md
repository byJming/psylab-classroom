# PsyLab

面向中国大陆高校心理学教学与公众科学体验的开源、浏览器原生心理实验平台。

## 一句话定位

把经典心理实验做成可直接打开、可复现、可解释、可导出的中文实验包；默认数据留在用户浏览器，不要求账号、数据库或安装桌面软件。

## 产品边界

PsyLab 不是心理诊断工具、人格测试站、智商测试站或云端科研数据服务。它提供的是：

- **体验馆**：公众完成开放层的经典心理实验，查看本次任务的行为指标和科学解释。
- **课堂模式**：教师选择教学预设，运行开放层或引导层实验；学生完成实验并下载结果包，教师在本地批量导入和汇总。
- **实验包仓库**：公开 Definition、Runner、Metrics、刺激材料、指标定义、样例数据和教学文档。

## 文档

- [产品与范围](docs/product-and-scope.md)
- [技术架构](docs/architecture.md)
- [数据契约](docs/data-contract.md)
- [实验目录与筛选标准](docs/experiment-catalog.md)
- [隐私、合规与风险](docs/privacy-and-risk.md)
- [路线图与质量门槛](docs/roadmap-and-quality.md)
- [静态部署](docs/deployment.md)
- [课程场景试用记录模板](docs/course-trial-feedback-template.md)
- [数据迁移说明](docs/migrations.md)
- [贡献指南与 DCO](CONTRIBUTING.md)
- [Experiment Definition Schema](schemas/experiment-definition.schema.json)
- [Session Manifest Schema](schemas/session-manifest.schema.json)
- [Result Bundle Schema](schemas/result-bundle.schema.json)

## 当前决策

1. 使用 React + TypeScript + Vite + jsPsych。
2. 采用 `Definition / Runner / Metrics` 统一实验模型。
3. IndexedDB 保存未导出的本地状态，CSV/JSON 作为可移交结果格式。
4. 不依赖运行时第三方 CDN、统计脚本、摄像头、麦克风或账号系统。
5. 实验发布层级与技术优先级分离：`open`、`guided`、`controlled` 决定运行边界，P0/P1/P2 决定实现顺序。
6. “开放层实验”指教育与一般体验场景下不涉及临床、身份、创伤、财务或生理采集；不承诺绝对零风险。

## 本地开发与部署

需要 Node.js 20+、pnpm 9+。首次安装依赖后运行：

```bash
pnpm install
pnpm dev
```

默认开发地址为 `http://localhost:5173/`。发布构建使用 `pnpm build`，产物位于 `dist/`，可直接部署到 GitHub Pages、Cloudflare Pages 或任意静态服务器。Vite 已配置相对 `base: "./"`，不需要后端路由；GitHub Pages 可将 `dist/` 发布到 Pages，Cloudflare Pages 的构建命令为 `pnpm build`、输出目录为 `dist`。

### 验证命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

首发版本包含 Simple RT、Stroop、Go/No-Go 和 Mental Rotation 四个 `open / beta` 实验。教师在“课堂会话”生成匿名配置，在“教师导入”本地校验 JSON、版本、配置哈希、重复提交和混合实验，并下载 CSV 错误报告。升级为 `stable` 前仍需满足路线图规定的两个真实课程场景试用反馈。

## 许可与贡献

- 代码： [Apache-2.0](LICENSE)。
- 教学文档与实验说明：CC BY 4.0。
- 原创通用刺激与样例数据：CC0 或单独声明的宽松许可。
- 第三方刺激、词表和量表：必须保留来源、许可和版本信息，不因进入仓库而自动获得开源许可。

贡献须遵守 [DCO](CONTRIBUTING.md#developer-certificate-of-origin)，并且不得提交真实课堂数据、个人信息或未经许可的材料。
