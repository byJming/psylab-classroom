# 数据契约

## 1. 版本与命名

所有公共数据格式带有 `format` 和 `formatVersion`。实验行为由 `experimentId + definitionVersion + configHash` 唯一描述；指标行为由 `metricsVersion + analysisRulesVersion` 描述。

推荐命名：

```text
psylab-result-<experimentId>-<sessionId>-<participantCode>-<attemptId>.json
psylab-summary-<experimentId>-<exportDate>.csv
```

文件名不得包含姓名、学号、手机号或其他直接身份信息。

## 2. Experiment Definition

```json
{
  "format": "psylab-experiment-definition",
  "formatVersion": "1.1",
  "experimentId": "stroop-color-word",
  "definitionVersion": "1.0.0",
  "metadata": {
    "title": "颜色词 Stroop 实验",
    "language": "zh-CN",
    "purpose": "观察文字语义与字体颜色冲突时的反应表现。",
    "theoryBackground": "自动化词义加工可能干扰按字体颜色作答的控制过程。",
    "design": "被试内比较一致与不一致条件。",
    "independentVariables": ["词义与字体颜色的一致性"],
    "dependentVariables": ["条件间反应时差", "总体正确率"],
    "durationMinutes": { "min": 5, "max": 15 },
    "riskLevel": "low",
    "status": "beta",
    "courses": ["实验心理学", "认知心理学"],
    "limitations": ["浏览器反应时不应用于跨设备能力排名。"]
  },
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "practiceTrials": { "type": "integer", "minimum": 4, "maximum": 16 },
      "testTrials": { "type": "integer", "minimum": 16, "maximum": 120 }
    },
    "required": ["practiceTrials", "testTrials"]
  },
  "runPolicy": {
    "tier": "open",
    "version": "1.0.0",
    "publicCatalog": true,
    "requiresTeacherAcknowledgement": false,
    "requiresDebrief": false
  },
  "metrics": [
    {
      "id": "stroop_interference_ms",
      "label": "Stroop 冲突效应",
      "unit": "ms",
      "description": "不一致条件与一致条件正确 trial 中位数反应时之差。",
      "kind": "within_subject_difference"
    }
  ],
  "license": {
    "code": "Apache-2.0",
    "content": "CC0-1.0",
    "sourceFile": "LICENSES.md"
  }
}
```

`runPolicy` 是发布边界的唯一权威来源。Session Manifest 和 Result Bundle 中的层级字段是经过复制的运行快照，必须与 Definition 一致。

`psylab-experiment-definition@1.1` 要求用中文声明理论背景、设计、自变量和因变量，使详情页、课堂说明和实验包审阅不需要从 trial 代码反推教学含义。

## 3. Session Manifest

```json
{
  "format": "psylab-session",
  "formatVersion": "1.0",
  "experimentId": "stroop-color-word",
  "definitionVersion": "1.0.0",
  "distributionTier": "open",
  "runPolicyVersion": "1.0.0",
  "config": {
    "preset": "class-15m",
    "practiceTrials": 8,
    "testTrials": 64,
    "language": "zh-CN"
  },
  "configHash": "sha256:...",
  "sessionId": "local-generated-id",
  "createdAt": "2026-08-18T00:00:00Z"
}
```

`distributionTier` 与 `runPolicyVersion` 是从 Definition 复制的运行约束，Runner 必须校验两者一致。`createdAt` 在教师本地生成，可选择不放入公开链接。Session Manifest 不包含个人信息，不包含教师通讯信息，不包含任何服务端凭据。`preset`、`language` 和教师确认等会话展示元数据可存在于 manifest，但不属于实验参数，不参与 `configHash` 或 Result Bundle 的 `experiment.config` 快照。

## 4. Result Bundle

```json
{
  "format": "psylab-result",
  "formatVersion": "1.1",
  "experiment": {
    "experimentId": "stroop-color-word",
    "definitionVersion": "1.0.0",
    "metricsVersion": "1.0.0",
    "analysisRulesVersion": "1.0.0",
    "distributionTier": "open",
    "runPolicyVersion": "1.0.0",
    "configHash": "sha256:...",
    "config": { "practiceTrials": 8, "testTrials": 64 }
  },
  "session": {
    "sessionId": "local-generated-id",
    "participantCode": "anon-7f3c",
    "attemptId": "attempt-uuid",
    "randomSeed": "seed-value"
  },
  "environment": {
    "browserFamily": "Chromium",
    "platformFamily": "Windows",
    "viewportBucket": "large",
    "inputMode": "keyboard"
  },
  "quality": {
    "completed": true,
    "focusLossCount": 1,
    "fullscreenExitCount": 0,
    "storageRecoveryUsed": false
  },
  "trials": [],
  "summary": {},
  "exportedAt": "2026-08-18T00:00:00Z"
}
```

`experiment.config` 是会话配置中参与随机化和分析的实验参数快照，必须通过该 Definition 的 `configSchema`，并在规范化后与 `configHash` 一致。它不能包含参与者代码、教师确认或其他会话元数据。环境字段采用粗粒度枚举，避免构造详细设备指纹。默认不保存完整 User-Agent、IP、精确屏幕尺寸、字体列表、时区偏移或硬件并发数。

`distributionTier` 必须随结果包保留，使导入器能够阻止把 `guided` 或 `controlled` 实验与普通公开体验数据混为一组。对 `guided` 实验，结果包必须在 `quality.flags` 中包含 `debrief-completed`；结果页与导入器会拒绝在此记录前解读或汇总该结果。对 `controlled` 实验，导入器必须显示额外的部署责任提示。

## 5. 规范化 trial 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `trialIndex` | integer | 当前任务中记录 trial 的顺序编号 |
| `phase` | enum | `instruction`、`practice`、`test`、`break` |
| `condition` | string | 实验条件，例如 `congruent` |
| `stimulusId` | string | 刺激稳定标识，不强制保存完整文本 |
| `correctResponse` | string/null | 预期响应 |
| `response` | string/null | 实际响应 |
| `correct` | boolean/null | 是否正确 |
| `outcome` | enum | correct、incorrect、no-response、anticipation 或 focus-loss；用于区分响应结果与清洗原因 |
| `rtMs` | number/null | 反应时，无法记录时为 null |
| `stimulusDurationMs` | number/null | 计划呈现时长 |
| `visibilityState` | enum | `visible` 或 `hidden` |
| `focusLostBeforeResponse` | boolean | 响应前是否失焦 |
| `excluded` | boolean | 是否排除于摘要 |
| `exclusionReasons` | string[] | 排除原因枚举 |
| `data` | object | 实验专属字段，必须在代码本中定义 |

原始响应不能被清洗结果覆盖。所有排除必须可追溯。

实验专属字段只能放在 `data` 对象中，例如记忆实验的 `setSize`、视觉搜索的 `targetPresent`。不得为了单个实验向公共 trial 顶层新增同名字段；如果字段未来需要跨实验复用，必须先更新 schema 和代码本。

### 试次节奏与提前反应字段（definitionVersion 1.1.0）

所有官方实验的 trial `data` 统一携带节奏字段，便于导入器重建与教学解释：

| 字段 | 说明 |
|---|---|
| `data.fixationMs` | 注视期时长（毫秒），由会话种子决定；Simple RT 为 800–3000ms，其余 400–1000ms |
| `data.itiMs` | 响应后的试次间隔（毫秒），300–700ms 随机 |
| `data.responseWindowMs` | 响应窗时长（毫秒）；可用 `config.responseWindowMs` 覆写，无需响应的试次不超过 1000ms |
| `data.anticipationSensitive` | 布尔；为 true 的实验（Simple RT、Go/No-Go）注视期按键会立即结束试次 |
| `data.responseDuringWindow` | 响应窗内的实际按键（无则 null） |
| `data.anticipationResponse` | 注视期内发生的提前按键（无则 null） |
| `data.anticipationRtMs` | 提前按键相对注视期开始的反应时（无则 null） |
| `data.congruent` | Stroop 专用：目标颜色与词义是否一致 |

## 6. CSV 导出

至少输出三个文件：

1. `trials.csv`：每个记录的 trial 一行（通过 `phase` 区分练习与正式阶段），保留原始字段和清洗字段。
2. `participant-summary.csv`：每个参与者一行，包含各条件的有效数、正确率、中位数 RT、均值 RT、条件差值和质量标记。
3. `codebook.csv` 或 `codebook.md`：每个字段的含义、单位、允许值和版本。

CSV 使用 UTF-8 with BOM 以提高 Windows/Excel 中文兼容性；JSON 使用 UTF-8 无 BOM。

## 7. 指标约定

默认优先使用被试内、条件内的描述统计：

- 正确 trial 的中位数反应时。
- 正确率、漏答率和错误率。
- 条件间 RT 差值和正确率差值。
- 有效 trial 数和排除比例。
- 任务特定的质量标记。

不提供统一的“能力分数”。任何参考分布必须声明来源、样本、版本、设备条件和适用范围；缺少可比数据时显示“暂无可比参考”，而不是强行给出常模排名。

公众结果页可以使用 Definition `metadata.publicMetric` 声明一个单一主指标。主指标只是帮助公众理解本次任务的描述性摘要，不是新的统计口径，也不改变 Result Bundle 中的 `raw`、`cleaned` 和 `byCondition`。展示层的简单变换（例如将 No-Go 虚报率转换为保持不按键的比例）必须在 Definition 中声明，原始指标仍需保留并导出。

正确率与反应时清洗必须分开：错误响应不能从正确率分母中删除；它们可以因不适合反应时分析而从 `cleaned` RT 统计中排除。质量标记应基于全部正式 trial 计算，不能只对清洗后的有效 RT trial 计算。

## 8. 导入校验

教师导入器必须在写入汇总前检查：

- `formatVersion` 是否支持。
- 实验版本、配置哈希和指标版本是否一致。
- participant/attempt 是否重复。
- trial 数量、条件数量和字段类型是否符合 Definition。
- 结果是否完整、是否被用户中途退出。
- 是否存在未知字段或来自不同实验的文件。

校验失败的文件不能静默丢弃，应进入可下载的错误报告。

### 8.1 篡改检测（definitionVersion 1.1.0 起）

除上述结构校验外，导入器会对每个结果包执行两类交叉验证：

1. **逐试次自洽重算**（完整与中断结果均执行）：`correct`、`outcome`、`excluded`、`exclusionReasons` 必须能从 `response`/`correctResponse`/`data.responseDuringWindow`/`data.anticipationResponse` 按运行时同一公式重算得出；`rtMs` 不得超出该试次响应窗（含 100ms 容差）；`data.anticipationRtMs` 不得超出注视期。用文本编辑器把错误响应改成正确、删掉排除标记或改出超界反应时都会被拒收。
2. **程序化字段比对**（完整结果执行）：用 `experimentId + config + randomSeed` 重建完整试次计划，`trial.data` 中由种子决定的程序化字段（`fixationMs`/`itiMs`/`responseWindowMs`/条件标签等）逐一比对，就地篡改 `data` 会被拒收。

此外，同一 `sessionId + participantCode` 下多个不同 `attemptId` 不是重复提交（都保留），但导入器会提醒教师该参与者重跑过多次，可能是挑选最好成绩后提交。

### 8.2 防篡改边界（诚实声明）

本地优先架构没有服务端签名密钥，因此存在导入器无法检测的篡改：把反应时数值改成另一个窗口内的自洽数值（例如把 650ms 改成 450ms）、用同一会话链接重跑后只提交最好的一次（有提醒但需要教师判断）、或在本地存储中伪造整套自洽结果。需要更强保证的场景应结合课堂监考、受控机房环境或（未来）自托管收集端点的服务端校验，而不是依赖结果文件本身。
