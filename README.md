# Wordsless

> A local-first, offline-capable vocabulary trainer. Expo + React Native,
> no backend. See [`plans/PLAN.md`](./plans/PLAN.md) for the full roadmap.

## Status

**Phase 4 complete.** Full learning loop shipped: FSRS scheduler, daily
review, study session with TTS, listen mode, favorites / exclude,
local notifications + daily reminder, streak tracking. The app is
feature-complete for personal use; next milestones are content
volume (Phase 1.5), EAS release pipeline (Phase 5), and product
polish (Phase 6).

## Features

- **FSRS scheduler** — proper spaced repetition (`ts-fsrs`), per-card
  stability / difficulty / due date, stored in SQLite.
- **Study session** — flashcard review with Again / Hard / Good / Easy
  ratings, TTS pronunciation (English + example sentence), AI-generated
  mnemonic / example / context (lazy, cached).
- **Listen mode** — hands-free audio review, TTS, swipe up = mastered.
- **Favorites + exclude** — per-word flag, hidden from review pool.
- **Daily reminder** — local notification via `expo-notifications`,
  configurable time (24h picker, 15-min step), single always-current
  scheduled entry (cancel-then-reschedule).
- **Streak** — flame badge (gold = today checked in, gray = not yet),
  28-day heatmap calendar (0 / 1–9 / 10–29 / 30–99 / 100+ reviews).
- **Offline-first** — all data in `expo-sqlite` (Drizzle ORM), no network
  required for the core loop.
- **CJK + EN** — wordbook content, AI explanations, and TTS cover
  中文 / English mixed content.

## Stack

| Area          | Pick                                       |
| ------------- | ------------------------------------------ |
| Framework     | Expo SDK 57 (RN 0.86, React 19)            |
| Router        | expo-router (file-based)                   |
| State         | Zustand                                    |
| DB            | expo-sqlite + Drizzle ORM                  |
| Scheduler     | ts-fsrs (FSRS-5)                           |
| Audio         | expo-speech (TTS)                          |
| Notifications | expo-notifications                         |
| Secure prefs  | expo-secure-store (settings persistence)   |
| AI runtime    | MiniMax / OpenAI-compatible (lazy, cached) |
| Tests         | Jest 29 + jest-expo + @testing-library/rn  |
| Lint / Format | ESLint (flat config) + Prettier + husky    |
| CI            | GitHub Actions (lint + typecheck + test)   |

## Quick start

```bash
pnpm install                # 装依赖,husky 会自动 wire pre-commit
pnpm start                  # 启动 Metro dev server + 弹 QR 码
```

`pnpm start` 起来后按对应键(或直接用子命令)选平台:

| Platform       | Key / Cmd            | 备注                                          |
| -------------- | -------------------- | --------------------------------------------- |
| iOS 模拟器     | `i` / `pnpm ios`     | 先 `xcrun simctl list devices` 看有哪些可用   |
| Android 模拟器 | `a` / `pnpm android` | 先在 Android Studio 启 AVD                    |
| 物理设备       | 终端扫 QR            | 装 **Expo Go**(SDK 57 对应版本),保证同一 WiFi |
| Web            | `w` / `pnpm web`     | ⚠️ 通知 / SQLite 部分能力受限,只适合看 UI     |

### 通知 / 推送相关

- 每日提醒走 `expo-notifications`,**只在真机 / 物理设备有效**
  (iOS 模拟器不触发系统通知)。
- 第一次进设置页开「每日提醒」会弹系统权限框,允许即可。
- 关闭 / 改时间会立刻 cancel 旧通知 + 重排新的,永远只会有一个调度项。

### 词书 / AI 内容

```bash
pnpm data:build              # 编 CET4 词书(JSON → SQLite 可导入格式)
pnpm data:build:all          # 编所有词书
pnpm data:ai                 # 跑 AI 生成助记 / 例句 / 上下文(慢,带 cache)
```

AI 走 MiniMax (OpenAI-compatible),需要 `MINIMAX_API_KEY` 等环境变量,
没配也能跑,只是词条没有 mnemonic / example。

### 验证不破坏既有功能

```bash
pnpm typecheck               # tsc --noEmit
pnpm test                    # Jest(143 tests)
pnpm lint                    # ESLint
pnpm format                  # Prettier write
pnpm format:check            # CI 用,只检查不改
```

## 常见坑

- **Metro 报红屏** — 八成是缓存,`pnpm start --clear` 或
  `npx expo start -c`。
- **首次启动慢几秒** — `expo-sqlite` 跑 migration,正常。
- **不要跑 `expo prebuild`** — 项目走 managed workflow,prebuild 会
  把整个原生工程重置。改原生配置走 config plugin。
- **iOS 通知不响** — 模拟器本来就不响,真机请检查系统设置 →
  通知 → Expo Go 是否允许。

## Directory layout

```
wordsless/
├─ app/                  # (placeholder,expo-router 默认空目录)
├─ src/
│  ├─ app/               # screens(file routes)
│  │  ├─ _layout.tsx     #   根布局 + 通知订阅 + settings hydrate
│  │  ├─ index.tsx       #   今日(home / hero / streak)
│  │  ├─ review.tsx      #   复习入口
│  │  ├─ study/          #   学习 session / listen mode
│  │  ├─ wordbooks/      #   词书列表 / 详情
│  │  ├─ stats.tsx       #   统计
│  │  └─ settings.tsx    #   设置(含每日提醒卡)
│  ├─ components/        # shared UI:Button / Card / StreakBadge / …
│  ├─ core/
│  │  ├─ fsrs.ts         # FSRS 包装
│  │  ├─ scheduler.ts    # 取 due 卡片 / 提交评分
│  │  ├─ audio/          # TTS 封装
│  │  ├─ ai/             # AI runtime + cache
│  │  └─ notifications/  # 权限 / 调度 / i18n
│  ├─ stores/            # Zustand(settings 等)
│  ├─ db/                # Drizzle schema / repositories / migrations
│  ├─ constants/         # design tokens(Colors / Spacing / Radii)
│  ├─ hooks/             # useColorScheme / useThemeColor
│  └─ __tests__/         # cross-cutting unit tests
├─ data/
│  ├─ raw/               # 源词书(JSON)
│  ├─ dist/              # 编译产物(cet4.compiled.json)
│  └─ build-words.ts     # 词书编译脚本
├─ plans/PLAN.md         # 完整 Phase 0–7 路线图
└─ .github/workflows/    # CI(lint + typecheck + test)
```

`src/app/`(而不是项目根 `app/`)是 Expo SDK 57 默认,
保留这个分层是为了更干净的 src-only 划分。

## Development workflow

1. Branch from `main`。
2. `pnpm install`(首次会 wire husky pre-commit)。
3. 提交时 `lint-staged` 自动跑 ESLint --fix + Prettier(只针对 staged 文件)。
4. 推 PR — CI 全绿才能合。
5. 写新功能前先在 `plans/PLAN.md` 找下对应 feature id(F01 / F12 / F14 …)
   对一下 scope。

## Roadmap

当前状态:**Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅**

待做(按 ROI 排):

- **Phase 1.5** — 5 套词书(50 词 stub + 跑 AI),纯内容铺量
- **Phase 5** — EAS 流水线(`eas.json` + release.yml),出 TestFlight /
  Play 内测轨
- **Phase 2 升级** — 真人 MP3 音频(目前只有 TTS,真实感差一截)
- **Phase 6 增强** — 随身听模式(F15)/ CSV 自定义词书(F16)/
  深色模式(F18)

完整 backlog 见 `plans/PLAN.md`。
