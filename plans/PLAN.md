# Wordsless 背单词 App — 功能调研与开发计划表

> 跨平台（Android / iOS）· React Native (Expo) · 个人独立开发 · **无后端服务**
> 版本：v1.1 · 2026-08-20 · 仓库：github.com/waylife/wordsless

---

## 1. 项目概述

一款本地优先、离线可用的背单词 App，覆盖四六级、考研、托福、雅思、GRE 等考试词库，核心体验为「FSRS 间隔重复算法调度 + 多题型学习复习 + 真人发音 + AI 例句与解释」。

架构约束：**不设后端服务**。数据全部存本地（SQLite），架构上预留同步接口（未来若加后端可无痛接入）；AI 内容能力（例句/解释/词根助记生成）由客户端直连 MiniMax API 实现。通过 GitHub Actions + EAS 实现推送自动编包与分发。

关键约束：个人独立开发，选型以低维护成本、Expo 托管生态优先；功能按 P0 → P1 → P2 分阶段交付。

---

## 2. 功能调研结论（竞品：百词斩 / 墨墨 / 扇贝 / 不背单词 / Anki / Quizlet）

### P0 — 必备（MVP 范围）

| #   | 功能             | 说明                                                                                                 |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| F1  | 间隔重复记忆算法 | 实现 FSRS（Anki 同款开源算法，比 SM-2 记忆保持率建模更准），按「会/模糊/不会」评分调度复习           |
| F2  | 学习模式         | 新词按 10 词一组小批次学习，卡片展示 + 自评熟悉度                                                    |
| F3  | 复习题型         | 看词选义（四选一）、听音辨词、拼写默写，覆盖再认→回忆→产出                                           |
| F4  | 每日计划         | 设定每日新词量（默认 30），复习量由算法自动计算，支持当日调整                                        |
| F5  | 单词卡片内容     | 英美双发音、音标、中英释义、1-2 条例句（例句在词库构建阶段由 MiniMax AI 生成，见第 5 节）            |
| F6  | 内置词库         | 四级/六级/考研/托福/雅思/GRE 分级词书，选书页展示词量与预计完成天数                                  |
| F7  | 生词本/收藏      | 学习或查词时收藏，独立复习入口                                                                       |
| F8  | 熟词剔除         | 标记"太简单"移出新词循环                                                                             |
| F9  | 本地持久化       | 完全离线可学，进度/调度状态存 SQLite                                                                 |
| F10 | 单词发音         | 真人音频为主（按词库分包下载 + 本地缓存），系统 TTS 兜底，支持英音/美音切换                          |
| F11 | AI 解释生成      | 客户端直连 MiniMax：对任意单词按需生成词源解析/记忆方法/近义辨析，结果缓存本地；API Key 管理在设置页 |

### P1 — 重要（留存关键，MVP 后第一优先级）

| #   | 功能           | 说明                                                                     |
| --- | -------------- | ------------------------------------------------------------------------ |
| F12 | 打卡与连续天数 | 日历打卡视图 + 连击天数，背单词类产品最强留存钩子                        |
| F13 | 学习统计       | 累计词量、今日新学/复习数、掌握度分布图                                  |
| F14 | 提醒通知       | 本地通知自定义每日提醒时间（expo-notifications，无需推送服务器）         |
| F15 | 随身听模式     | 当日单词音频串播，通勤场景高频需求                                       |
| F16 | 自定义词书导入 | 导入 CSV/TXT 自建词表，考试党刚需                                        |
| F17 | AI 例句个性化  | 按用户水平/兴趣定制生成例句（如"用四级词汇量生成例句"）、AI 例句填空练习 |
| F18 | 深色模式       | Appearance + 主题 token，成本低                                          |

### P2 — 加分（差异化，视时间选做）

F19 记忆曲线可视化 · F20 徽章成就 · F21 桌面 Widget 小组件（今日任务/随机单词） · F22 打卡分享图 · F23 AI 口语跟读打分（如未来接入 MiniMax Speech/ASR） · F24 云端同步（需另建后端，依赖 SyncProvider 预留接口）

---

## 3. 技术选型（2026-08 调研结论）

| 领域       | 选型                                               | 理由                                                                                       |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 框架       | **Expo SDK 54**（RN 0.81 新架构）+ Dev Client      | 官方推荐形态，免原生环境维护，需要原生能力时 prebuild 即可，无需 eject                     |
| 路由       | **expo-router**                                    | 文件式路由，深链免费，Expo 生态一等公民                                                    |
| 状态管理   | **Zustand**                                        | 轻量无样板代码，2026 社区首选                                                              |
| 本地数据库 | **expo-sqlite + Drizzle ORM**                      | 词库与进度是关系型数据；UI 只经 Repository 层访问。**避开 Realm（已弃用）**                |
| 高频小数据 | **react-native-mmkv**                              | 设置项、主题、引导状态                                                                     |
| 密钥存储   | **expo-secure-store**                              | 用户自填的 MiniMax API Key 存系统钥匙串，不落明文                                          |
| 记忆算法   | **FSRS**（open-spaced-repetition 开源实现）        | 比 SM-2 更准，有现成 TS 库可用                                                             |
| 音频播放   | **expo-audio**（expo-av 官方继任者）               | 单实例复用连播、load() 预加载、处理音频焦点                                                |
| 发音来源   | 真人音频按词库分包下载 + expo-speech 兜底          | 开源约 11.9 万词 MP3 库可作基础（需核对授权）；在线 TTS API 不作主力                       |
| AI 能力    | **MiniMax API（OpenAI 兼容端点）**                 | 无后端直连；详见第 5 节                                                                    |
| 通知       | **expo-notifications** 本地通知                    | 无需推送服务器；注意 Android 13+ 权限与通知渠道                                            |
| 云同步预留 | Repository + **SyncProvider 抽象**（先 Noop 实现） | 学习记录用追加式事件日志建模，主键 UUID + updated_at，未来若建后端可接 PowerSync/自建 REST |
| CI/CD      | **EAS Build/Submit/Update + GitHub Actions**       | 见第 7 节流水线设计                                                                        |

### 项目目录结构（建议）

```
wordsless/
├─ app/                        # expo-router 页面
│  ├─ (tabs)/                  # 首页(今日) / 复习 / 统计 / 设置
│  ├─ study/session.tsx        # 学习/复习会话页
│  └─ wordbooks/select.tsx     # 选词书页
├─ src/
│  ├─ components/              # WordCard、选项按钮、进度环等
│  ├─ core/                    # fsrs 调度器、AudioManager、ai/(MiniMax客户端+prompt)
│  ├─ db/                      # Drizzle schema、迁移、repositories/
│  ├─ stores/                  # zustand: settings、session、stats
│  ├─ sync/                    # SyncProvider 接口 + NoopSync
│  └─ theme/
├─ data/                       # 词库源 JSON + 构建脚本 + AI 批量生成脚本
├─ .github/workflows/          # ci.yml / release.yml
├─ eas.json / app.json
```

---

## 4. 数据模型设计（本地优先，预留同步）

```
wordbooks    id(uuid) · code(cet4/cet6/kaoyan/toefl/ielts/gre) · name · word_count · 下载状态
words        id · book_id · spelling · phonetic_uk · phonetic_us
             · meanings(JSON) · examples(JSON) · root_affix · audio_status
word_states  id(uuid) · word_id · status(new/learning/review/mastered/excluded)
             · fsrs_state(stability/difficulty/due/reps/lapses) · updated_at
review_log   id(uuid) · word_id · rating · mode(learn/choice/listen/spell) · ts   ← 追加式事件日志
ai_content   id(uuid) · word_id · type(example/root/mnemonic/diff) · content
             · model · created_at                              ← AI 生成结果缓存，命中即不再调 API
favorites    word_id · ts
checkins     date · new_count · review_count · study_seconds
settings     存 MMKV：每日新词量、发音英美偏好、提醒时间、主题；API Key 存 expo-secure-store
```

同步预留三原则：用户数据表全部 UUID 主键 + `updated_at`；词库与 ai_content 为不可变引用数据不参与同步；学习行为只追加 review_log，天然可合并。

---

## 5. AI 能力设计（MiniMax 直连 · 无后端架构）

### 两种使用场景

| 场景               | 时机                           | 方式                                                                              |
| ------------------ | ------------------------------ | --------------------------------------------------------------------------------- |
| 词库构建期批量生成 | 开发阶段，本地/CI 跑 Node 脚本 | 为每词批量生成例句、词根词缀、助记，人工抽检后固化进词库 DB —— 用户端零成本零延迟 |
| 运行时按需生成     | 用户点击"AI 解释"              | App 直连 MiniMax，流式输出，结果写入 ai_content 缓存，同一词同一类型永不再调      |

### 接入规格（2026-08 核实）

- 端点：OpenAI 兼容协议，baseURL `https://api.minimaxi.com/v1`，用 `chat/completions`；可直接用 OpenAI SDK/fetch 封装，无需专用 SDK
- 模型：`MiniMax-M2`（性价比首选，批量生成）或 `MiniMax-M3`（质量更高，运行时解释）
- 计费：M2 系约 ¥2.1/百万输入 tokens、¥8.4/百万输出 tokens，缓存命中读取低至 ¥0.21/百万
- 成本估算：每词约 300 输入 + 200 输出 tokens ≈ ¥0.0025；**1 万词词库全量生成约 ¥25，六套词库约 ¥100 量级**，一次性投入

### API Key 管理（无后端的关键决策）

- 首选「用户自带 Key」：设置页输入自己的 MiniMax Key，存 expo-secure-store（系统钥匙串）；这是无后端方案下最安全的模式
- 开发/内测期可内置开发者 Key 方便测试，但要清楚风险：Key 可从 App 包中提取，正式发布前必须移除或加调用限频
- 客户端做限频与配额保护：运行时生成限每词每天 N 次、每日总量上限，防误触刷量

### Prompt 与质量控制

- 输出约束为严格 JSON（example_en / example_cn / root / mnemonic / diff 字段），限定例句词汇不超过目标考试等级
- 词源与助记要求"基于真实词根词缀，不确定则留空"，抑制幻觉；构建期人工抽检 3-5%，运行时提供"重新生成/报错"入口
- 降级策略：未配置 Key 或无网络时，AI 入口置灰并说明，学习流程完全依赖词库内置静态内容，不受影响

---

## 6. 开发阶段计划（个人独立开发估时）

> 估时按 1 人、每天约 4h 投入折算；每阶段有可验收产物。

### Phase 0 — 工程脚手架（约 3 天）

| 任务                                                                                    | 产出                  |
| --------------------------------------------------------------------------------------- | --------------------- |
| Expo SDK 54 + TS 初始化，expo-router 骨架，4 个 tab 占位页                              | 可运行 App            |
| ESLint + Prettier + husky pre-commit；Jest 基础配置                                     | `pnpm lint/test` 通过 |
| 主题 token（亮/暗）、基础组件库（Button/Card/ProgressRing）                             | UI 基线               |
| GitHub 仓库初始化：README、LICENSE、.gitignore、PR 校验 workflow（lint+typecheck+test） | CI 绿灯               |

✅ 验收：`git push` 后 PR 自动检查通过；真机（Dev Client）跑起 tab 框架。

### Phase 1 — 数据层与词库管道（约 8 天）

| 任务                                                                                                  | 产出                                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Drizzle schema + 迁移；Repository 层封装（UI 不直写 SQL）                                             | db 层单测通过                          |
| 词库构建脚本：公开词库 JSON → 清洗 → 编译为 SQLite 文件/JSON 包                                       | data/build-words.ts                    |
| **AI 批量生成脚本：Node 调 MiniMax 为每词生成例句/词根/助记，限流+断点续跑+结果校验，抽检后并入词库** | data/gen-ai-content.ts，CET-4 全量生成 |
| 整理四六级词库（含音标/释义/AI 例句），跑通「选书→导入→词表浏览」                                     | CET-4/6 可用                           |
| 考研/托福/雅思/GRE 词库整理（可并行穿插进行，AI 生成随批跑）                                          | 6 套词书齐备                           |

✅ 验收：选书后本地词库就绪，词表页可浏览、可搜索；AI 例句抽检合格率 ≥ 95%。
⚠️ 注意：词库与释义来源核对授权；例句用 AI 生成天然规避例句版权问题。

### Phase 2 — 发音系统（约 3 天，可与 Phase 1 并行）

| 任务                                                                                                            | 产出          |
| --------------------------------------------------------------------------------------------------------------- | ------------- |
| AudioManager：expo-audio 单实例复用、切词 unload、load() 预加载、音频焦点处理                                   | core/audio.ts |
| 音频资源管道：按词库 zip 包下载（expo-file-system）+ 解包到本地；未命中时在线按需下载缓存；最终兜底 expo-speech | 离线发音可用  |
| 英音/美音切换设置                                                                                               | 设置项生效    |

✅ 验收：断网状态下点词即播，发音延迟 < 300ms。

### Phase 3 — 核心学习复习 + AI 解释（约 12 天，MVP 关键路径）

| 任务                                                                                              | 产出             |
| ------------------------------------------------------------------------------------------------- | ---------------- |
| FSRS 调度器封装：评分→到期队列生成；每日任务（新词+复习）计算                                     | core/fsrs + 单测 |
| 学习会话页：10 词一组、卡片翻面、自评「认识/模糊/不认识」                                         | 学习流程完整     |
| 复习题型组件：四选一选义、听音辨词、拼写默写（按记忆强度选题型）                                  | 三种题型可用     |
| 会话内发音自动播放、答对/答错反馈动效、会话结束小结页                                             | 体验闭环         |
| 生词本/收藏、熟词剔除                                                                             | F7/F8            |
| **MiniMax 客户端封装（core/ai）：OpenAI 兼容调用、流式输出、超时重试、限频、ai_content 缓存读写** | AI 服务层 + 单测 |
| **卡片页"AI 解释"入口：词源/助记/辨析流式展示 + 重新生成；设置页 API Key 录入（SecureStore）**    | F11 可用         |

✅ 验收：连续使用 3 天，复习队列按算法正确滚动；无 Key 时 AI 入口优雅降级；有 Key 时生成结果二次打开秒出（缓存命中）。

### Phase 4 — 计划/统计/留存（约 5 天）

| 任务                                               | 产出    |
| -------------------------------------------------- | ------- |
| 每日新词量设置、当日任务调整                       | F4 完整 |
| 打卡日历 + 连续天数（checkins 表）                 | F12     |
| 统计页：累计词量、掌握度分布、近 7 日柱状图        | F13     |
| 每日提醒本地通知（权限申请 + 通知渠道 + 重排逻辑） | F14     |

✅ 验收：设置 21:00 提醒准时触达；断签/补签边界正确。

### Phase 5 — CI/CD 自动编包流水线（约 2 天，详见第 7 节）

✅ 验收：push tag 后无需人工干预，TestFlight + Play 内测轨收到新包。

### Phase 6 — P1 增强（约 7 天，按优先级选做）

F15 随身听模式（2d）→ F17 AI 例句个性化/例句填空（2d）→ F16 自定义词书导入 CSV/TXT（2d）→ F18 深色模式打磨（1d）

### Phase 7 — P2 差异化（视进度，每项 1-3 天）

F21 Widget 小组件 → F19 记忆曲线可视化 → F20 徽章 → F22 分享图

### 里程碑总览

| 里程碑 | 内容                                                    | 预计时点     |
| ------ | ------------------------------------------------------- | ------------ |
| M1     | 工程跑通，CI 绿灯                                       | 第 1 周末    |
| M2     | MVP：学习+复习+发音+AI 例句/解释+四六级词库             | 第 5 周末    |
| M3     | 首个内测版上架 TestFlight / Play 内测轨（含全套 CI/CD） | 第 6-7 周    |
| M4     | P1 功能完整、六套词库齐备                               | 第 10 周     |
| M5     | 公测/正式版（可选 P2 若干）                             | 第 12 周左右 |

总工作量约 44-52 人天，弹性 10-12 周（按每天 4h）。

---

## 7. CI/CD 流水线设计（GitHub 自动触发编包）

### 流水线总览

```
PR 提交       → ci.yml：lint + typecheck + jest + expo-doctor（不编包，省额度）
push → main  → EAS Update 推送 OTA 到 preview channel（秒级，不消耗 build 额度）
push tag v*  → release.yml：eas build (Android aab+apk / iOS ipa)
               → eas submit：TestFlight + Google Play 内测轨
手动 dispatch → workflow_dispatch 支持选择性平台/profile 临时编包
```

### 关键配置

**eas.json**：三个 profile —— `development`（Dev Client）、`preview`（内测 apk+ipa）、`production`（商店包，自动递增 buildNumber）。

**GitHub Secrets**：`EXPO_TOKEN`（EAS 控制台生成，权限 build+submit）。签名由 EAS 托管（Android keystore 存 EAS 服务端；iOS 证书由 EAS 自动管理），GitHub 侧无需放证书。

**release.yml 核心步骤**：

```yaml
on:
  push: { tags: ['v*.*.*'] }
jobs:
  build:
    runs-on: ubuntu-latest # EAS 云端编译，不占本地 runner
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: '${{ secrets.EXPO_TOKEN }}' }
      - run: eas build --platform all --profile production --non-interactive --no-wait
      - run: eas submit --platform all --non-interactive
```

**商店提审凭证**：Android keystore 与 iOS 证书由 EAS 云端托管（`eas credentials` 自动管理，GitHub 侧不放证书）；但 EAS Submit 上传商店需要两套密钥存入 Secrets——iOS 用 App Store Connect API Key（`.p8` 文件 + Key ID + Issuer ID），Android 用 Google Play 服务账号 JSON。注意：两个商店的 App 记录首次需手动创建（App Store Connect 建 App、Play 控制台建应用并走完初始上架流程），之后 CI 才能自动提审。

**OTA 热更新**：expo-updates 配 3 个 channel（development / preview / production），`runtimeVersion` 用 `policy: "appVersion"`（原生依赖变动多时改 `fingerprint`）；main 分支推送 `eas update --branch preview`，修复类小版本不发新包直接 OTA。支持灰度发布（0→1→10→50→100%）与回滚（重发旧 bundle 即可，无需删除）。AI prompt 模板调整属于 JS 变更，走 OTA 即可快速迭代，无需重新编包。

**版本管理**：语义化版本（app.json `version`）+ conventional commits；tag 由 `npm version patch/minor` 生成并推送触发编包。buildNumber/versionCode 在 CI 中用 `git rev-list --count HEAD` 动态生成（app.config.js 读环境变量），保证单调递增；也可用 `eas build --auto-increment` 或 `eas build:version:set` 手动同步。

**额度控制**：EAS 免费额度每月 30 次 build（Android/iOS 各 15 次），EAS Update 限 1K 月活 —— 仅 tag 触发整包构建，日常迭代走 OTA，个人使用足够；超限可 `eas build --local` 本地兜底。构建跑在 EAS 云端（iOS 用 Expo 的 Mac），GitHub runner 只执行 CLI 编排（ubuntu-latest 即可），几乎不消耗 GitHub 的 macOS 分钟数。

**前置条件**：Apple Developer 账号（$99/年）+ Google Play 开发者账号（$25 一次性），在 M3 前注册。

---

## 8. 风险与对策

| 风险                           | 对策                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 词库/释义版权不明              | 优先 MIT/CC0 开源词库；例句改为 MiniMax AI 生成，规避例句版权；音频核对来源授权后再入库              |
| **API Key 安全（无后端直连）** | 正式版采用"用户自带 Key"模式；内置 Key 仅限内测且加限频；发布前审计包内无明文 Key                    |
| AI 内容质量不稳定              | 构建期抽检 3-5% + prompt 约束真实词源；运行时提供重新生成与报错入口；无 Key/离线时优雅降级到静态内容 |
| AI 调用成本超预期              | 批量生成一次性约 ¥100 封顶；运行时缓存命中不再调用 + 每日配额上限                                    |
| iOS 审核被拒（功能单薄）       | M3 前补齐统计/打卡等完整体验；准备审核演示视频                                                       |
| FSRS 参数冷启动                | 先用官方默认参数，积累 review_log 后再个人化优化                                                     |
| 词库数据质量参差               | 构建脚本加校验（音标格式/释义非空/重复词去重/AI JSON 结构校验），CI 跑校验                           |
| 安装包体积膨胀（词库+音频）    | 词库按需下载不内置全部；音频分包；首装仅含 CET-4                                                     |
| EAS 免费额度不够               | tag-only 编包策略 + OTA 为主；必要时购买少量额度                                                     |

---

## 9. 建议的第一步动作（本周）

1. `npx create-expo-app wordsless --template` 初始化进现有仓库，接入 expo-router。
2. 配置 `.github/workflows/ci.yml`（lint/test），推首个 PR 验证。
3. 注册 MiniMax 开放平台账号，申请 API Key（platform.minimaxi.com），跑通一次 chat/completions 调用。
4. 建 `data/` 词库管道：先下载/整理 CET-4 JSON，写构建脚本与 AI 批量生成脚本雏形。
5. 注册 EAS 账号，生成 EXPO_TOKEN 存入仓库 Secrets（为 Phase 5 铺路）。
