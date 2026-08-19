export type PresentationAccent = "coral" | "teal" | "indigo" | "amber";

export interface GuideStep {
  title: string;
  description: string;
}

export interface GuideResponse {
  key: string;
  action: string;
  detail: string;
}

export interface GuideExample {
  title: string;
  rule: string;
  sequence: readonly string[];
  currentIndex: number;
  compareIndex: number;
  answer: string;
}

export interface ExperimentPresentation {
  category: string;
  accent: PresentationAccent;
  previewKind: string;
  previewLabel: string;
  conditionLine: string;
  responseKeys: string;
  colorSensitive?: boolean;
  guide: {
    focus: string;
    response: string;
    sequence: string;
    steps: readonly GuideStep[];
    responses: readonly GuideResponse[];
    example?: GuideExample;
    note?: string;
  };
}

const presentations: Record<string, ExperimentPresentation> = {
  "simple-rt": {
    category: "反应速度", accent: "coral", previewKind: "dots", previewLabel: "目标出现", conditionLine: "目标 · 反应时", responseKeys: "空格键",
    guide: {
      focus: "看到圆点后，尽快按空格。",
      response: "看到圆点才按键；注视点出现时不要按。",
      sequence: "注视点 → 圆点 → 按键 → 下一题",
      steps: [{ title: "等待", description: "屏幕中央出现十字时保持不按键。" }, { title: "反应", description: "圆点一出现，立刻按空格。" }, { title: "继续", description: "按键后等待下一题，不需要连续按键。" }],
      responses: [{ key: "空格", action: "按键", detail: "看到圆点时按" }]
    }
  },
  "choice-rt": {
    category: "反应与选择", accent: "teal", previewKind: "choice", previewLabel: "2 · 4 选 1", conditionLine: "2 选 1 · 4 选 1", responseKeys: "按颜色对应按键",
    guide: {
      focus: "看到彩色圆点后，按它对应的键。",
      response: "先看圆点颜色，再按屏幕上约定的颜色键。",
      sequence: "注视点 → 彩色圆点 → 找对应键 → 按键",
      steps: [{ title: "看颜色", description: "屏幕会出现一个彩色圆点。" }, { title: "找按键", description: "根据颜色与按键的对应关系选择按键。" }, { title: "作答", description: "确认后按一次对应键，进入下一题。" }],
      responses: [{ key: "F", action: "红色", detail: "红色圆点" }, { key: "G", action: "绿色", detail: "绿色圆点（4 选 1）" }, { key: "J", action: "蓝色", detail: "蓝色圆点" }, { key: "K", action: "紫色", detail: "紫色圆点（4 选 1）" }],
      note: "2 选 1 只会出现红色和蓝色；4 选 1 会出现红、绿、蓝、紫四种颜色。"
    }
  },
  "stroop-color-word": {
    category: "冲突与注意", accent: "coral", previewKind: "stroop", previewLabel: "颜色与词义", conditionLine: "一致 · 冲突", responseKeys: "红 F / 绿 J / 蓝 K", colorSensitive: true,
    guide: {
      focus: "只判断字的颜色，不读字的意思。",
      response: "例如“红”字显示成蓝色，也要按蓝色对应的键。",
      sequence: "注视点 → 颜色词 → 看字体颜色 → 按键",
      steps: [{ title: "忽略词义", description: "文字本身写了什么不是答案。" }, { title: "看字体颜色", description: "只辨认文字实际显示的颜色。" }, { title: "按颜色作答", description: "红按 F，绿按 J，蓝按 K。" }],
      responses: [{ key: "F", action: "红色", detail: "字体是红色时按" }, { key: "J", action: "绿色", detail: "字体是绿色时按" }, { key: "K", action: "蓝色", detail: "字体是蓝色时按" }]
    }
  },
  flanker: {
    category: "冲突与注意", accent: "amber", previewKind: "flanker", previewLabel: "中央目标", conditionLine: "方向一致 · 方向冲突", responseKeys: "左 F / 右 J",
    guide: {
      focus: "只判断中央箭头，忽略两侧箭头。",
      response: "中央箭头向左按 F，向右按 J。",
      sequence: "注视点 → 一排箭头 → 找中央箭头 → 按键",
      steps: [{ title: "定位", description: "一排箭头出现后，先找到正中央的箭头。" }, { title: "忽略干扰", description: "两侧箭头可能方向相同，也可能相反；不要按它们。" }, { title: "按中央方向", description: "向左按 F，向右按 J。" }],
      responses: [{ key: "F", action: "中央箭头向左", detail: "只看中央箭头" }, { key: "J", action: "中央箭头向右", detail: "只看中央箭头" }]
    }
  },
  simon: {
    category: "冲突与注意", accent: "indigo", previewKind: "simon", previewLabel: "位置与颜色", conditionLine: "位置相容 · 位置冲突", responseKeys: "红 F / 绿 J", colorSensitive: true,
    guide: {
      focus: "只判断圆点颜色，忽略它出现在左边还是右边。",
      response: "红色按 F，绿色按 J；位置不是作答依据。",
      sequence: "注视点 → 左/右圆点 → 看颜色 → 按键",
      steps: [{ title: "看颜色", description: "圆点会出现在中央左侧或右侧。" }, { title: "忽略位置", description: "不管圆点在哪一边，都按颜色作答。" }, { title: "按颜色", description: "红按 F，绿按 J。" }],
      responses: [{ key: "F", action: "红色圆点", detail: "位置无关" }, { key: "J", action: "绿色圆点", detail: "位置无关" }]
    }
  },
  "go-no-go": {
    category: "反应抑制", accent: "teal", previewKind: "go-no-go", previewLabel: "行动或停止", conditionLine: "Go · No-Go", responseKeys: "圆形按空格，方形不按",
    guide: {
      focus: "圆形按键，方形忍住不按。",
      response: "圆形按空格；方形出现时保持不按，等它自动消失。",
      sequence: "注视点 → 圆形或方形 → 按键或等待 → 下一题",
      steps: [{ title: "看到圆形", description: "立即按空格，这是需要行动的 Go 试次。" }, { title: "看到方形", description: "不要按任何键，这是需要停止的 No-Go 试次。" }, { title: "等待下一题", description: "方形不需要补按或用其他键回应。" }],
      responses: [{ key: "空格", action: "圆形", detail: "Go：需要按键" }, { key: "不按", action: "方形", detail: "No-Go：保持不按" }]
    }
  },
  "visual-search": {
    category: "注意与搜索", accent: "indigo", previewKind: "search", previewLabel: "找到目标", conditionLine: "特征搜索 · 结合搜索", responseKeys: "找到 J / 没有 F",
    guide: {
      focus: "在一组图形中判断目标是否出现。",
      response: "看到红色圆形按 J；确定没有红色圆形按 F。",
      sequence: "注视点 → 搜索陈列 → 找目标 → 按键",
      steps: [{ title: "扫描", description: "看屏幕上的所有图形，不要只看第一眼的位置。" }, { title: "找目标", description: "目标是红色圆形，其他图形都是干扰物。" }, { title: "报告结果", description: "找到按 J；确定没有找到按 F。" }],
      responses: [{ key: "J", action: "找到了红色圆形", detail: "目标出现" }, { key: "F", action: "没有红色圆形", detail: "目标未出现" }]
    }
  },
  "mental-rotation": {
    category: "空间与表象", accent: "amber", previewKind: "rotation", previewLabel: "同形或镜像", conditionLine: "同形 · 镜像", responseKeys: "同形 F / 镜像 J",
    guide: {
      focus: "判断左右两个图形是不是同一个形状。",
      response: "可以想象旋转后仍能重合按 F；如果是镜像翻转按 J。",
      sequence: "注视点 → 两个旋转图形 → 比较结构 → 按键",
      steps: [{ title: "比较结构", description: "观察两个图形的转角和凸起位置。" }, { title: "允许旋转", description: "方向不同不代表不同；想象把其中一个转过来。" }, { title: "判断关系", description: "同形按 F，镜像按 J。" }],
      responses: [{ key: "F", action: "同一个形状", detail: "旋转后可以重合" }, { key: "J", action: "镜像形状", detail: "需要翻转才能对应" }]
    }
  },
  "posner-cueing": {
    category: "空间注意", accent: "teal", previewKind: "cue", previewLabel: "线索与目标", conditionLine: "有效 · 无效 · 中性", responseKeys: "左 F / 右 J",
    guide: {
      focus: "线索出现后，判断目标最终在左边还是右边。",
      response: "目标在左按 F，目标在右按 J；不要按线索指向的位置。",
      sequence: "注视点 → 方向线索 → 位置目标 → 按键",
      steps: [{ title: "看线索", description: "先出现的箭头只是提示，不一定指向目标。" }, { title: "等目标", description: "等圆点真正出现在左侧或右侧。" }, { title: "按目标位置", description: "左按 F，右按 J。" }],
      responses: [{ key: "F", action: "目标在左", detail: "按目标实际位置" }, { key: "J", action: "目标在右", detail: "按目标实际位置" }]
    }
  },
  "signal-detection": {
    category: "知觉判断", accent: "indigo", previewKind: "signal", previewLabel: "信号或噪声", conditionLine: "有信号 · 无信号", responseKeys: "有信号 F / 无信号 J",
    guide: {
      focus: "在纹理背景中判断有没有隐藏的小信号。",
      response: "认为有信号按 F；认为没有信号按 J。",
      sequence: "纹理背景 → 仔细观察 → 判断有无 → 按键",
      steps: [{ title: "观察背景", description: "每一题都会出现一块带纹理的圆形区域。" }, { title: "寻找信号", description: "判断其中是否有较亮的小圆点。" }, { title: "报告判断", description: "看到信号按 F；没有看到按 J。" }],
      responses: [{ key: "F", action: "有信号", detail: "看到了小圆点" }, { key: "J", action: "无信号", detail: "没有看到小圆点" }]
    }
  },
  "n-back": {
    category: "工作记忆", accent: "amber", previewKind: "n-back", previewLabel: "更新字母", conditionLine: "1-back 区块 · 2-back 区块", responseKeys: "匹配 F / 不匹配 J",
    guide: {
      focus: "每组先记住规则，再判断当前字母是否匹配。",
      response: "1-back 比上一个字母；2-back 比前两个字母。相同按 F，不同按 J。",
      sequence: "区块规则 → 字母序列 → 向前回看 → 按键",
      steps: [{ title: "记住区块规则", description: "每组开始会提示一次“1-back”或“2-back”；组内规则不变。" }, { title: "先看准备字母", description: "1-back 先看 1 个、2-back 先看 2 个字母；这是记忆准备，不需要按键。" }, { title: "比较并按键", description: "之后 1-back 比上一个、2-back 比前两个；相同按 F，不同按 J。" }],
      responses: [{ key: "F", action: "相同", detail: "当前字母与规则指定位置的字母相同" }, { key: "J", action: "不相同", detail: "当前字母与规则指定位置的字母不同" }],
      example: { title: "看一个 2-back 例子", rule: "本组规则：2-back", sequence: ["B", "H", "B"], currentIndex: 2, compareIndex: 0, answer: "当前 B 要和前两个位置的 B 比较。两者相同，所以按 F。" },
      note: "练习阶段会逐题显示对错；正式阶段不显示对错。准备字母不计入结果，正式作答从有参照的第一个字母开始。"
    }
  },
  "task-switching": {
    category: "执行控制", accent: "coral", previewKind: "switch", previewLabel: "规则切换", conditionLine: "规则重复 · 规则切换", responseKeys: "按当前规则 F / J",
    guide: {
      focus: "先看当前规则，再按颜色或形状作答。",
      response: "颜色规则：红 F、蓝 J；形状规则：圆 F、方 J。",
      sequence: "规则提示 → 彩色图形 → 按当前规则判断 → 按键",
      steps: [{ title: "看规则", description: "图形上方会提示本题按颜色还是按形状判断。" }, { title: "看图形", description: "图形同时有颜色和形状，但只有当前规则相关的那一项算答案。" }, { title: "按键", description: "颜色规则：红 F、蓝 J；形状规则：圆 F、方 J。" }],
      responses: [{ key: "F", action: "红色或圆形", detail: "取决于当前规则" }, { key: "J", action: "蓝色或方形", detail: "取决于当前规则" }]
    }
  }
};

const fallback: ExperimentPresentation = {
  category: "开放实验", accent: "teal", previewKind: "default", previewLabel: "程序化刺激", conditionLine: "条件比较", responseKeys: "按屏幕提示作答",
  guide: {
    focus: "按照屏幕上的提示完成每一题。",
    response: "先看刺激，再按屏幕提示的按键作答。",
    sequence: "注视点 → 刺激 → 判断 → 按键",
    steps: [{ title: "看提示", description: "先确认这一题需要判断什么。" }, { title: "观察刺激", description: "根据屏幕上的规则完成判断。" }, { title: "按键作答", description: "按一次对应的键，等待下一题。" }],
    responses: [{ key: "按屏幕提示", action: "完成判断", detail: "按一次对应按键" }]
  }
};

export function presentationFor(experimentId: string): ExperimentPresentation {
  return presentations[experimentId] ?? fallback;
}
