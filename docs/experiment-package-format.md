# 实验包结构约定

PsyLab 的每个实验都应逐步从集中式 Definition 迁移为可审阅的实验包。目标是让研究员不需要阅读页面组件，就能检查实验方法、刺激来源、参数、分析规则和样例结果。

推荐结构：

```text
experiments/<experiment-id>/
  definition.json          # 可序列化元数据和发布策略
  parameters.schema.json   # 参数、默认值、单位和边界
  about.md                 # 面向教师和研究员的实验说明
  citations.md             # 理论、范式和软件引用
  runner.ts                # 正式 trial 时间线和响应规则
  metrics.ts               # 原始/清洗统计与质量规则
  stimuli.ts               # 刺激生成或资源索引
  LICENSES.md              # 代码、刺激、字体和词表许可
  fixtures/
    fixed-seed.json
    normal-result.json
    all-wrong-result.json
    no-response-result.json
    focus-loss-result.json
```

## 最低审阅内容

`about.md` 至少说明研究问题、被试内/被试间设计、自变量、因变量、试次数、响应方式、练习和正式阶段、排除规则、浏览器限制、适用课程和不应作出的解释。

`parameters.schema.json` 除 JSON 类型外，还应说明单位、默认值、最小/最大值、条件平衡约束和预计时长。教师配置界面只能暴露已经声明的参数。

`fixtures/` 必须覆盖正常、全错、无响应、失焦和中途退出。固定随机种子应能重建相同的 trial 条件和刺激元数据。

实验包没有完整说明、许可或 Metrics 测试时，保持 `beta`，不得标记为 `stable`。
