# ADR 0005：Result Bundle 保存可校验的实验配置快照

## 状态

Accepted

## 背景

仅保存 `configHash` 能识别与已知会话的参数不一致，却不能让独立导入器在缺少会话文件时验证参数 schema、重建 trial 结构或检查条件数量。这与课堂结果包应自包含、可复现的目标不一致。

## 决策

将 Result Bundle 升级为 `psylab-result@1.1`，在 `experiment.config` 保存规范化后的实验参数快照。该快照必须通过对应 Definition 的 `configSchema`，且其 canonical SHA-256 必须等于 `experiment.configHash`。匿名参与者代码和教师确认等非实验参数不进入快照。

导入器使用快照重建固定随机种子下的 trial 计划，检查完成结果的数量、索引、阶段与条件结构。由于预发布的 `1.0` 文件不具备可靠迁移所需的配置，首发 beta 明确拒绝它，而不是猜测或静默补齐。

## 后果

- Result Bundle 在没有会话文件时仍可审计实验参数和 trial 结构。
- 教师会话文件仍用于确认特定课堂会话、发布策略和配置哈希。
- 格式升级会拒绝旧的预发布结果；迁移必须保留原始 trial 与原始 Session Manifest。
- 结果包体积会略增，但 P0 参数是很小的 JSON 对象，收益大于成本。
