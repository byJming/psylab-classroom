# 数据迁移说明

当前公开格式为 `psylab-experiment-definition@1.1`、`psylab-session@1.0` 和 `psylab-result@1.1`。首发 beta 不执行隐式迁移；导入器只接受当前 schema 声明的精确格式版本，并会拒绝 Definition、Metrics、analysis rules、发布层级或配置哈希不一致的同批次文件。

## Definition 1.1

`psylab-experiment-definition@1.1` 为教学可审阅性增加并要求 `metadata.theoryBackground`、`metadata.design`、`metadata.independentVariables` 和 `metadata.dependentVariables`。此前仓库内的预发布 `1.0` Definition 不作为稳定公共格式保留；部署者迁移自定义实验时必须补齐这四项中文内容，再通过当前 JSON Schema 校验。

## 官方实验 definitionVersion 1.1.0

四个官方实验（simple-rt、stroop-color-word、go-no-go、mental-rotation）的 `definitionVersion` 升级到 `1.1.0`，原因是试次生成逻辑发生结构性变化：

- 每个试次新增节奏字段 `data.fixationMs`（注视期）、`data.itiMs`（试次间隔）与 `data.responseWindowMs`（响应窗）；`simple-rt` 旧字段 `data.delayMs` 改名为 `data.fixationMs` 并把随机区间从 600–1100ms 拓宽到 800–3000ms。
- Stroop 改为条件 × 目标颜色的交叉单元格均衡（各单元格计数差 ≤ 1），不再由 index 取模分配颜色。
- Mental Rotation 改为同异 × 角度 8 单元格均衡后种子洗牌，刺激改为两侧各旋转 ±angle/2。
- Simple RT 与 Go/No-Go 标记 `data.anticipationSensitive`：注视期按键会立即结束该试次并记为 `outcome: "anticipation"`，原始响应保留在 `data.anticipationResponse` 与 `data.anticipationRtMs`。
- 所有实验的 `configSchema` 新增可选参数 `responseWindowMs`（500–6000ms）。

`metricsVersion` 与 `analysisRulesVersion` 保持 `1.0.0`：指标公式与清洗规则未变。旧会话链接中的 `definitionVersion: 1.0.0` 会被运行页拒绝并提示重新生成会话；旧导出的完整 Result Bundle 会因 Definition 版本不是当前版本被导入器拒绝，应重新运行任务生成新结果。

## 新增官方实验 choice-rt / flanker / simon / visual-search

四个新增开放层实验（choice-rt、flanker、simon、visual-search）从首版即使用 `definitionVersion 1.1.0`，遵循同一套节奏规范（注视期 → 响应窗 → ITI、种子确定性、可选 `responseWindowMs` 覆写）与条件单元格均衡规则，见 `docs/experiment-catalog.md` §7。

- 新增试次数据字段均为原始值并随结果包导出：`data.setSize`/`data.colorName`/`data.responseKey`/`data.responseKeys`（choice-rt）、`data.direction`/`data.flankerCompatible`（flanker）、`data.position`/`data.colorName`/`data.responseKey`（simon）、`data.searchType`/`data.setSize`/`data.targetPresent`（visual-search）；字段含义见各实验代码本。
- 新增指标 id（`choice_cost_ms`、`flanker_effect_ms`、`simon_effect_ms`、`feature_slope_ms_per_item`、`conjunction_slope_ms_per_item`）不改变已有实验的指标公式与清洗规则，`metricsVersion` 与 `analysisRulesVersion` 保持 `1.0.0`。
- 新实验不影响旧结果包的导入：导入器按 experimentId 匹配 Definition，新增实验只扩展可接受范围，不修改已有校验路径。

## N-back definitionVersion 1.1.0

N-back 从逐试次混合 1-back/2-back 改为固定负荷区块：练习阶段 2 个短区块，正式阶段 4 个区块，1-back/2-back 各占一半。每个区块开始先显示一次规则提示和 n 个不要求作答的准备字母，计时响应窗内只呈现正式字母，避免把规则阅读混入反应时，也避免要求参与者对没有参照的首个字母作答。试次新增 `data.ruleCue` 和 `data.leadInLetters`，指标公式与清洗规则版本保持不变。

旧 `definitionVersion: 1.0.0` 会话与结果不自动迁移，因为同一随机种子下的条件顺序和正确答案已经改变；应重新生成会话并运行。

## Result Bundle 1.1

`psylab-result@1.1` 在 `experiment.config` 中增加经过规范化的实验参数快照。该对象必须通过当前 Definition 的 `configSchema`，其 SHA-256 必须等于 `experiment.configHash`；不保存匿名参与者代码、教师确认或其他会话元数据。它使独立导入器可以验证参数与 trial 结构，而不必依赖外部会话文件。

预发布的 `psylab-result@1.0` 不含足以可靠恢复参数的快照，因此导入器会明确拒绝。维护者若需要保留历史文件，应同时保留原始 Session Manifest，在离线审计流程中补齐参数快照、计算哈希并生成新的 `1.1` Result Bundle；不得猜测缺失配置或覆盖原始 trial。

## 规范化哈希

`configHash` 对实验参数对象执行递归 JSON canonicalization：对象键按 Unicode 字符串排序，数组保持顺序，数字/字符串/null 使用 JSON 标准编码；随后计算 SHA-256 并以 `sha256:<64 位十六进制>` 保存。匿名参与者代码在学生浏览器运行前本地填写，不写入会话链接；教师确认是会话元数据，不参与实验配置哈希。

## 未来格式升级

升级 `formatVersion` 或公共字段时，必须新增迁移函数和固定 fixture，保留原始 trial，不覆盖旧结果，并在导入报告中记录迁移前后版本。未实现迁移前，导入器必须明确拒绝而不是猜测字段含义。
