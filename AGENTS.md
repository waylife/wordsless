# Wordsless 项目规则

本文件是 AI 编码助手与协作者在本仓库工作时的约定。改动代码前请先阅读；与系统/安全策略冲突时以后者为准。

## 1. 页面安全区规则（强制）

**所有新增页面（无论 tab 页还是根 Stack 子页面），内容都不得被顶部状态栏/灵动岛和底部 Home 指示条/Tab 栏遮挡。**

背景：本项目的根 Stack 是 `headerShown: false`（见 `src/app/_layout.tsx`），tab 栏由 NativeTabs 渲染，因此**没有任何系统布局 inset 兜底**，每个页面必须自己处理安全区。

### 1.1 顶部安全区（状态栏 / 灵动岛）

自绘头部的页面（即所有根 Stack 下的子页面，如 `src/app/settings/ai.tsx`、`src/app/wordbooks/*`）必须：

- 用 `useSafeAreaInsets()` 取 `insets.top`，把它加进内容容器的 `paddingTop`；
- **禁止**用固定像素（如 `paddingTop: 48`）代替——刘海/灵动岛机型数值不同；
- ScrollView / FlatList 必须设置 `contentInsetAdjustmentBehavior="never"`，避免系统 inset 与手动 inset 叠加。

正确示例（`src/app/settings/ai.tsx`）：

```tsx
const insets = useSafeAreaInsets();
<ScrollView
  contentContainerStyle={[
    styles.screenContent,
    { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.six },
  ]}
  contentInsetAdjustmentBehavior="never"
  keyboardShouldPersistTaps="handled"
>
```

### 1.2 底部安全区（Home 指示条 / Tab 栏）

- 所有可滚动容器（ScrollView / FlatList / SectionList）的 `contentContainerStyle.paddingBottom` 必须包含 `insets.bottom`，并加 1–3 档 `Spacing` 缓冲，保证最后一个可交互元素（按钮、卡片）不被压住；
- 在 `(tabs)` 组内的页面：`insets.bottom` 已由 NativeTabs 附加（含 tab 栏高度），直接使用即可（参考 `src/app/(tabs)/settings.tsx`：`insets.bottom + Spacing.three`）；
- 在根 Stack 下的子页面：`insets.bottom` 只是 Home 指示条，缓冲建议给到 `Spacing.four` 以上（参考 `src/app/settings/ai.tsx`：`insets.bottom + Spacing.six`）；
- 页面主操作按钮若放在列表底部，同样遵循上述规则；不要把关键按钮绝对定位在 `bottom: 0` 附近。

### 1.3 Modal 弹层

`Modal`（transparent）在 iOS 上没有系统返回手势，必须做到：

1. 卡片设 `maxHeight`（约 `'85%'`）+ `flexShrink: 1`，长表单内容包进 `ScrollView`（设 `flexShrink: 1`），**底部「取消/保存」按钮固定在滚动区之外**，任何内容长度下都可见可点；
2. 提供至少一个始终可见的关闭出口：右上角「✕」或底部「取消」；`onRequestClose` 仅覆盖 Android 返回键，不能作为 iOS 的唯一出口；
3. 多行 TextInput 用固定 `height`（内容在框内滚动），不要用 `minHeight` 让它无限撑高弹窗。

反例教训：`PromptEditorModal` 曾因 `minHeight` 文本框把按钮挤出屏幕导致弹窗无法关闭（已修复，勿回退）。

### 1.4 新页面自查清单

新增页面合入前逐项确认：

- [ ] 顶部内容从 `insets.top` 之下开始，状态栏/灵动岛不压住任何文字或按钮；
- [ ] 滚动内容末尾有 `insets.bottom` + 缓冲，最后一个可点元素不被遮挡；
- [ ] `contentInsetAdjustmentBehavior="never"`（可滚动容器）；
- [ ] 所有 Modal 有常驻关闭出口，按钮不会被内容挤出；
- [ ] 在带刘海的模拟器（或真机）上目视检查过顶部与底部。

## 2. Git 提交规范（强制）

### 2.1 提交信息一律用英文

- `git commit -m` 的标题与正文全部使用英文；正文可省略，标题必须英文。
- 标题格式 `type(scope): imperative summary`，祈使句、首字母小写、句尾不加句号，建议 ≤72 字符：

  - `feat(ai): support anthropic-style chat endpoint`
  - `refactor(nav): move root screens into (tabs) route group`
  - `test(ai): cover multi-source model catalog`
  - `fix(ui): stop splash overlay from swallowing touches`
  - `docs: add repo coding rules`
  - `chore: ignore local scratch directories`

- 常用 `type`：`feat` 新功能 / `fix` 修复 / `refactor` 重构（不改行为）/ `test` 测试 / `docs` 文档 / `chore` 杂项 / `build` 构建配置。`scope` 取改动所在的领域，如 `ai`、`nav`、`db`、`ui`、`settings`、`data`。

### 2.2 按功能拆分提交，不要把一堆改动塞进一个提交

**一次提交只对应一个功能或一个内聚的改动点。** 工作区里跨多个功能的改动必须拆成多个提交，每个提交：

- 自己就是可编译、可测试的（不依赖后续提交才成立的引用）；
- 只包含与该功能直接相关的文件，不夹带格式化、无关重排或顺手改的别处代码；
- 附带该功能自己的测试，或至少不破坏已有测试。

常见拆分方式：

| 提交            | 内容                                             |
| --------------- | ------------------------------------------------ |
| `docs: ...`     | `AGENTS.md`、`README` 等文档                     |
| `chore: ...`    | `.gitignore`、脚本、依赖声明                     |
| `feat(...)`     | 一个功能的核心实现（类型/协议/存储层）           |
| `feat(...)`     | 同一功能的 UI 层（页面/组件），单独一个提交      |
| `refactor(...)` | 不改变行为的重构（路由重组、文件移动、模块抽取） |
| `fix(...)`      | 单个 bug 修复                                    |
| `test(...)`     | 仅补测试                                         |

拆分前先按**依赖方向**排序：被依赖的模块（core / store / db）在前，依赖它的 UI / 页面在后，测试随其功能走。若两个文件彼此循环引用（例如 `core/ai/runtime.ts` 与 `stores/ai-store.ts`），它们必须进入同一个提交，不要拆。

提交前自查：

- [ ] `git status --porcelain` 里每个已暂存文件都属于本次提交描述的那一个功能；
- [ ] 提交信息是英文、符合 `type(scope): summary`；
- [ ] 本地工具/会话临时产物（`.box-agent/`、`2026-*/` 任务目录、散落的截图 PNG）未被暂存。

### 2.3 其他约定

- 设计 token（颜色/字号/间距/圆角）一律从 `@/constants/theme` 取，不在组件里硬编码；
- 状态持久化遵循各 store 既有模式（SQLite `settings` 表 + Zustand 镜像，敏感信息走 `expo-secure-store`）；
- 提交前跑 `npm run typecheck`、相关 `jest` 与 `eslint`；新增功能需附带针对性测试。
