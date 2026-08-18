# ADR 0004：首发版本采用静态 React Runner 与 jsPsych 兼容适配

## 状态

Accepted

## 背景

首个公开版本必须在纯静态主机上完成预检、练习、正式 trial、刷新恢复和本地导出。引入收集后端会改变本地优先的数据边界；直接把所有流程交给 jsPsych DOM 也会让断点恢复、分层告知和中文错误状态难以统一。

## 决策

使用 React 状态机承载页面、告知、预检、trial 响应和恢复；以 `TrialPlan` 编译出可序列化的 jsPsych timeline 兼容结构，并提供浏览器端按需 materialize 适配，实验 Definition、Runner、Metrics 的公共数据边界仍遵循文档契约。首发四个 P0 实验使用原创程序化刺激，统一采用 `open / beta`，不启用 `guided` 或 `controlled` 内容；完成路线图规定的两次真实课程场景试用前，不得标记为 `stable`。

## 后果

- 所有结果仍使用 Result Bundle，后续可替换具体时序 Runner 而不改变 Metrics 与导入器。
- 浏览器反应时只作描述性教学指标，不承诺实验室级精度。
- 静态页面无法阻止会话链接转发，也无法替代教师伦理、参与者资格和身份管理。
