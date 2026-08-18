# 贡献指南

感谢你帮助完善 PsyLab。提交前请先阅读 [产品边界](docs/product-and-scope.md)、[数据契约](docs/data-contract.md)、[隐私与风险](docs/privacy-and-risk.md) 与 [路线图](docs/roadmap-and-quality.md)。

## 提交边界

- 不提交真实课堂结果、可识别个人信息、浏览器日志、截图或导出文件。测试只能使用仓库内的合成固定 fixtures。
- 不提交未经再分发许可的量表、词表、图像、音频、字体或数据集。新增或替换刺激时，必须更新相应实验目录的 `LICENSES.md`，写明来源、版本、许可和改动。
- 不加入临床筛查、人格或智力标签、能力排名、远程追踪、账号、云端数据库、摄像头、麦克风或生理采集。
- 浏览器反应时只能作为教学用描述性行为指标，不能宣称实验室设备级精度。

## 变更要求

代码和文档变更应保持聚焦。影响公共格式、分析规则或发布策略的变更，需要新增 ADR 并更新迁移说明。

新增或修改实验时，至少需要：

1. Definition、参数 schema、`runPolicy`、中文教学说明和 `LICENSES.md`。
2. 固定随机种子 fixture，以及覆盖正常、全错、无响应、失焦、重复与缺字段的 Metrics 测试。
3. Definition → Runner → Result Bundle 的闭环，以及 JSON/CSV 导出导入 round-trip 验证。
4. 结果页、代码本和导出字段说明；不得以诊断、人格或能力等级解释结果。

提交前运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

涉及用户流程或运行时的变更，也应运行浏览器 smoke 和相应 P0 测试，并在 Pull Request 中记录实际命令与结果。

## Developer Certificate of Origin

PsyLab 使用 [DCO 1.1](https://developercertificate.org/)；不要求版权转让。每个提交必须使用 `git commit -s` 签署，例如：

```bash
git commit -s -m "feat: 增加实验说明"
```

签署表示你确认自己有权按项目许可提交该贡献。签署行应为：

```text
Signed-off-by: Your Name <your.email@example.com>
```

项目代码按 [Apache-2.0](LICENSE) 许可。教学文档、刺激和第三方材料以各自文件中的声明为准，不能因代码许可而推定获得其再分发权。
