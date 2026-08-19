export function ExperimentPreview({ kind, label, compact = false }: { kind: string; label: string; compact?: boolean }) {
  let content;
  if (kind === "dots") {
    // 简单反应时：同心测速脉冲圆环与核心触发点
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="60" r="44" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />
        <circle cx="100" cy="60" r="28" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="100" cy="60" r="14" fill="currentColor" fillOpacity="0.15" />
        <circle cx="100" cy="60" r="7" fill="currentColor" />
        <line x1="100" y1="8" x2="100" y2="112" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.2" />
        <line x1="20" y1="60" x2="180" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.2" />
      </svg>
    );
  } else if (kind === "choice") {
    // 选择反应时：4色决策分支与响应节点
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 25 L45 85 M100 25 L82 85 M100 25 L118 85 M100 25 L155 85" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.3" />
        <circle cx="100" cy="25" r="5" fill="currentColor" opacity="0.7" />
        <circle cx="45" cy="85" r="9" fill="#d94841" />
        <circle cx="82" cy="85" r="9" fill="#2f9e44" />
        <circle cx="118" cy="85" r="9" fill="#1971c2" />
        <circle cx="155" cy="85" r="9" fill="#7048a8" />
      </svg>
    );
  } else if (kind === "stroop") {
    // 颜色词 Stroop：语义与色彩的层叠错位排版
    content = (
      <div className="preview-stroop-art">
        <span className="stroop-shadow red-text">蓝</span>
        <span className="stroop-main blue-text">红</span>
        <span className="stroop-accent green-text">绿</span>
      </div>
    );
  } else if (kind === "flanker") {
    // Flanker 侧抑制：箭头阵列与冲突对比
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
          <path d="M40 50 L52 60 L40 70" />
          <path d="M68 50 L80 60 L68 70" />
          <path d="M132 50 L144 60 L132 70" />
          <path d="M160 50 L172 60 L160 70" />
        </g>
        <g stroke="#c45c49" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M112 48 L98 60 L112 72" />
          <rect x="90" y="38" width="28" height="44" rx="4" stroke="#c45c49" strokeWidth="1" strokeDasharray="2 2" fill="#c45c49" fillOpacity="0.08" />
        </g>
      </svg>
    );
  } else if (kind === "simon") {
    // Simon 空间相容性：左右空间偏置与注视中轴十字
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="100" y1="48" x2="100" y2="72" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="88" y1="60" x2="112" y2="60" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <circle cx="48" cy="60" r="16" fill="#d94841" />
        <circle cx="48" cy="60" r="22" stroke="#d94841" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        <circle cx="152" cy="60" r="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.2" />
      </svg>
    );
  } else if (kind === "go-no-go") {
    // Go / No-Go 响应抑制：行动圆与停止方块的博弈
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="68" cy="60" r="20" fill="#237c84" />
        <circle cx="68" cy="60" r="27" stroke="#237c84" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
        <rect x="122" y="42" width="36" height="36" rx="5" fill="#253139" />
        <rect x="117" y="37" width="46" height="46" rx="8" stroke="#253139" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3" />
      </svg>
    );
  } else if (kind === "search") {
    // 视觉搜索：网格点阵与突出目标
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="52" y="32" width="10" height="10" fill="#596fa0" rx="1" />
        <rect x="85" y="32" width="10" height="10" fill="#596fa0" rx="1" />
        <circle cx="123" cy="37" r="5" fill="#596fa0" />
        <circle cx="147" cy="37" r="5" fill="#596fa0" />

        <circle cx="57" cy="60" r="5" fill="#596fa0" />
        <rect x="85" y="55" width="10" height="10" fill="#596fa0" rx="1" />
        <circle cx="123" cy="60" r="7" fill="#c45c49" />
        <circle cx="123" cy="60" r="12" stroke="#c45c49" strokeWidth="1.5" strokeDasharray="3 2" />
        <rect x="142" y="55" width="10" height="10" fill="#596fa0" rx="1" />

        <rect x="52" y="78" width="10" height="10" fill="#596fa0" rx="1" />
        <circle cx="90" cy="83" r="5" fill="#596fa0" />
        <rect x="118" y="78" width="10" height="10" fill="#596fa0" rx="1" />
        <circle cx="147" cy="83" r="5" fill="#596fa0" />
      </svg>
    );
  } else if (kind === "rotation") {
    // 心理旋转：几何构件的立体等角角度旋转
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(62, 60) rotate(-25)">
          <path d="M-14 -22 L0 -22 L0 6 L18 6 L18 20 L-14 20 Z" fill="currentColor" opacity="0.85" />
          <path d="M-14 -22 L0 -22 L-6 -27 L-20 -27 Z" fill="currentColor" opacity="0.4" />
          <path d="M18 6 L18 20 L23 15 L23 1 Z" fill="currentColor" opacity="0.6" />
        </g>
        <path d="M92 60 C96 52 104 52 108 60" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.4" />
        <g transform="translate(138, 60) rotate(50)">
          <path d="M-14 -22 L0 -22 L0 6 L18 6 L18 20 L-14 20 Z" fill="currentColor" opacity="0.85" />
          <path d="M-14 -22 L0 -22 L-6 -27 L-20 -27 Z" fill="currentColor" opacity="0.4" />
          <path d="M18 6 L18 20 L23 15 L23 1 Z" fill="currentColor" opacity="0.6" />
        </g>
      </svg>
    );
  } else if (kind === "cue") {
    // Posner 空间线索：注意探照光束与位置目标
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 60 L46 32 L46 88 Z" fill="#237c84" fillOpacity="0.12" />
        <polygon points="104,60 96,52 96,57 84,57 84,63 96,63 96,68" fill="#237c84" />
        <circle cx="48" cy="60" r="14" fill="#237c84" />
        <circle cx="48" cy="60" r="20" stroke="#237c84" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="152" cy="60" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      </svg>
    );
  } else if (kind === "signal") {
    // 信号检测：高斯噪声阵列与隐匿信号
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="60" r="38" stroke="currentColor" strokeWidth="1" opacity="0.25" />
        <circle cx="100" cy="60" r="36" fill="url(#noise-grad)" />
        <circle cx="94" cy="56" r="8" fill="#fff" fillOpacity="0.85" filter="drop-shadow(0 0 6px rgba(255,255,255,0.8))" />
        <defs>
          <radialGradient id="noise-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#737b84" />
            <stop offset="100%" stopColor="#434a52" />
          </radialGradient>
        </defs>
      </svg>
    );
  } else if (kind === "n-back") {
    // N-back 工作记忆：记忆序列流与回溯连线
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="52" y="68" fill="currentColor" opacity="0.45" fontSize="24" fontFamily="Georgia, serif" fontWeight="600" textAnchor="middle">B</text>
        <text x="100" y="68" fill="currentColor" opacity="0.25" fontSize="20" fontFamily="Georgia, serif" textAnchor="middle">A</text>
        <text x="148" y="68" fill="currentColor" fontSize="28" fontFamily="Georgia, serif" fontWeight="700" textAnchor="middle">B</text>
        <path d="M52 42 C72 18 128 18 148 42" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" strokeOpacity="0.8" />
        <path d="M148 42 L143 33 M148 42 L139 42" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.8" />
        <circle cx="52" cy="80" r="2.5" fill="currentColor" opacity="0.4" />
        <circle cx="100" cy="80" r="2.5" fill="currentColor" opacity="0.4" />
        <circle cx="148" cy="80" r="2.5" fill="currentColor" />
      </svg>
    );
  } else if (kind === "switch") {
    // 任务切换：双维度（色彩 / 几何）规则转化
    content = (
      <svg className="preview-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="42" y="38" width="44" height="44" rx="8" stroke="#c45c49" strokeWidth="1.5" fill="#c45c49" fillOpacity="0.1" />
        <circle cx="64" cy="60" r="12" fill="#c45c49" />
        <path d="M96 60 L108 60 M104 54 L110 60 L104 66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        <rect x="118" y="38" width="44" height="44" rx="8" stroke="#237c84" strokeWidth="1.5" fill="#237c84" fillOpacity="0.1" />
        <rect x="130" y="50" width="20" height="20" rx="3" fill="#237c84" />
      </svg>
    );
  } else {
    content = <strong>◆</strong>;
  }
  return (
    <div className={`experiment-preview preview-${kind}${compact ? " compact" : ""}`} aria-label={label}>
      <div className="preview-inner">
        {content}
      </div>
    </div>
  );
}
