# Wordsless

> A local-first, offline-capable vocabulary trainer. Expo + React Native,
> no backend. See [`plans/PLAN.md`](./plans/PLAN.md) for the full roadmap.

## Status

**Phase 0 — Engineering scaffold.** UI is just four placeholder tabs
(今日 / 复习 / 统计 / 设置) with shared Button / Card / ProgressRing
primitives. The MVP learning loop lands in Phase 3.

## Stack

| Area          | Pick                                       |
| ------------- | ------------------------------------------ |
| Framework     | Expo SDK 57 (RN 0.86, React 19)            |
| Router        | expo-router (file-based)                   |
| State         | Zustand (planned)                          |
| DB            | expo-sqlite + Drizzle ORM (Phase 1)        |
| Tests         | Jest 29 + jest-expo + @testing-library/rn  |
| Lint / Format | ESLint (flat config) + Prettier + husky    |
| AI            | MiniMax (OpenAI-compatible) — Phase 3      |
| CI            | GitHub Actions (this repo) + EAS for build |

## Quick start

```bash
pnpm install
pnpm start            # Expo dev server
pnpm test             # Jest
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier write
```

## Directory layout

```
wordsless/
├─ app/                  # expo-router entry
├─ src/
│  ├─ app/               # screens (file routes)
│  ├─ components/        # shared UI: Button, Card, ProgressRing …
│  ├─ constants/         # design tokens (Colors, Spacing, Radii, …)
│  ├─ hooks/             # useColorScheme, useThemeColor …
│  └─ __tests__/         # cross-cutting unit tests
├─ plans/                # living product & engineering plan
└─ .github/workflows/    # CI (lint + typecheck + test)
```

The directory under `src/app/` (not the project root `app/`) is the
Expo SDK 57 default; we kept it for the cleaner separation.

## Development workflow

1. Branch from `main`.
2. `pnpm install` (husky will wire the pre-commit hook on first run).
3. Pre-commit runs `lint-staged` (ESLint --fix + Prettier on staged files).
4. Open a PR — CI must pass before merge.

## Roadmap

See [`plans/PLAN.md`](./plans/PLAN.md) for the full Phase 0–7 plan and
the feature backlog (P0 → P1 → P2).
