# `/impeccable audit`: the whole change from `main` (step 5)

Target: `jj diff --from main`, meaning `/board?variant=A` (picked), today's `/board`, and the variant B/C, switcher, and shadcn `dropdown-menu` code also in the diff. Findings recorded, **not fixed**.

Evidence: `.verify/journeys/audit.ts` (re-run after step 3: target sizes, checkbox, keyboard drag, live regions, dark heading), `.verify/journeys/audit2.ts` (tab order, pick-mode states, 200% text), the CLI detector on the 13 changed source files, and the in-page overlay from the critique run. Chromium, emulated 390×844 / 1440×900, mouse and keyboard. **Untested:** real touch (no `hasTouch`, so the `pointer-coarse` sizes were not exercised) and a real screen reader (live-region text read from the DOM).

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Primary button text 4.4:1 (white on `#1770f9`); text at 200% overflows the phone layout |
| 2 | Performance | 3 | Prototype switcher re-binds its window `keydown` listener on every render (effect without deps) |
| 3 | Theming | 2 | Bucket palette still hard-coded (`text-*-900 dark:text-*-200`) instead of tokens; today's board badges 3.3–3.6:1 |
| 4 | Responsive Design | 3 | Variant A is fluid with 44/36 px targets; 200% text → `scrollWidth` 598 at 390 wide; 768 px falls back to horizontally scrolling columns |
| 5 | Implementation Integrity | 2 | Prototype scaffolding lives in the production route (`?variant=` + B/C + switcher, gated only by `import.meta.env.DEV`); two divergent boards |
| **Total** | | **13/20** | **Acceptable (significant work needed)** |

## Implementation Integrity Verdict

**Pass for the picked design, fail as a shippable change.** Variant A expresses a coherent, product-specific move model (pick up → place, thumb-zone strip, named announcements). The change as a whole is still a prototype: three variants and a dev switcher hang off the real route, and today's board and variant A disagree on names, card content (tags missing in A), and controls. Detector: `side-tab` at `todo-card.tsx:44` (CLI). In-page: `low-contrast` ×several, `nested-cards` ×25 (false positive: kanban cards in a column panel), `side-tab` and `ai-color-palette` (today's board, inherited Bucket colours).

## Executive Summary

- Audit Health Score: **13/20** (Acceptable), up from 10/20 in step 3.
- Issues: P0 0 · P1 3 · P2 4 · P3 3
- Top issues:
  1. Primary button text contrast 4.4:1 (theme token).
  2. Bucket badge/icon contrast 3.3–3.6:1 on today's board, light mode.
  3. Layout overflows at 200% text on a phone.
  4. Prototype scaffolding in the production route.
- **The three known defects are resolved** (see Positive Findings).

## Detailed Findings by Severity

**[P1] Primary button text below 4.5:1**
- Location: theme `--primary` (`src/styles/app.css`); "Wrap up the day", "+" (Add task), "Move" while picked
- Category: Accessibility / Theming. WCAG 1.4.3.
- Impact: low-vision users get small white text on blue at 4.4:1.
- Recommendation: a darker primary for text-bearing fills, or a larger/bolder label.
- Suggested command: `$impeccable colorize`

**[P1] Bucket colour pairs fail contrast on today's board**
- Location: `bucket-column.tsx` `bucketStyles` (`text-violet-900` on `bg-violet-900/50` = 3.5:1; blue 3.6:1; amber 3.3:1)
- Category: Accessibility / Theming. WCAG 1.4.3 / 1.4.11.
- Impact: count badges and icons are hard to read.
- Recommendation: tokens for Bucket colours with checked pairs, light and dark.
- Suggested command: `$impeccable colorize`

**[P1] Text at 200% overflows the phone layout**
- Location: variant A phone. App header, Bucket strip (2 tab buttons overflow), `scrollWidth` 598 at 390 px.
- Category: Accessibility / Responsive. WCAG 1.4.4 / 1.4.10.
- Impact: users who enlarge text get sideways scrolling and clipped tab labels.
- Recommendation: let the strip drop counts/icons or wrap at large text; allow the header to wrap.
- Suggested command: `$impeccable adapt`

**[P2] Pick-mode targets don't expose state**
- Location: `variant-a-pick-and-place.tsx` `BucketTab`
- Category: Accessibility
- Impact: in pick mode the strip's buttons change from navigation to "Move to …" with no role or state change. Only the nav name and button labels change, and the source Bucket is just `disabled` ("Today, 5 tasks").
- Recommendation: describe the mode on the group (`aria-describedby` the banner) and give the source a reason ("Already in Today").
- Suggested command: `$impeccable harden`

**[P2] Prototype scaffolding in the production route**
- Location: `routes/_authenticated/board.tsx` (`validateSearch` variant), `board.tsx`, `prototype/*`, `prototype-switcher.tsx`
- Category: Implementation Integrity
- Impact: three board implementations to maintain. The switcher is hidden only by `import.meta.env.DEV`, while `?variant=A|B|C` still works in production.
- Recommendation: fold A into the real board, then drop B, C, the switcher, and the param (prototype skill, step 6).
- Suggested command: `$impeccable polish`

**[P2] Bucket colours are hard-coded per type**
- Location: `bucket-column.tsx`; switcher `bg-fuchsia-700`
- Category: Theming
- Impact: dark mode was patched with `dark:` utilities rather than tokens, so a theme change means editing five classes.
- Recommendation: Bucket colour tokens in `app.css`.
- Suggested command: `$impeccable colorize`

**[P2] Variant A card omits tags and category colour**
- Location: `variant-a-pick-and-place.tsx` `PickCard`
- Category: Implementation Integrity
- Impact: data visible on today's board disappears in the picked design.
- Recommendation: render tags and the category colour.
- Suggested command: `$impeccable layout`

**[P3] Switcher re-binds its key listener on every render**
- Location: `prototype-switcher.tsx` (`useEffect` without a dependency list)
- Category: Performance. Negligible in practice.
- Suggested command: `$impeccable optimize`

**[P3] Smooth scrolling ignores reduced motion**
- Location: `variant-b-horizon-ladder.tsx:72` (`scrollIntoView({ behavior: 'smooth' })`), `bucket-todo-list-scroll.ts:14` (from `main`)
- Category: Accessibility (motion)
- Suggested command: `$impeccable animate`

**[P3] Category stripe (`side-tab`)**
- Location: `todo-card.tsx:44`. Inherited theme decision.
- Suggested command: `$impeccable quieter`

## Patterns & Systemic Issues

- Colour is the weak system: no tokens for Bucket colour, a primary token under AA for small text, and nearness not encoded.
- Prototype and production code share one route; every fix has to land in two board implementations.

## Positive Findings

- **Known defects, verified resolved:**
  - *Hover-only checkbox:* visible at rest (`opacity: 1`) on both boards, named "Mark "X" as done", 24 px box with a 44/36 px hit area.
  - *Small touch targets:* 0 controls under 24 px on either board (was 25); 44 px on coarse pointers, 36 px on fine.
  - *Drag-and-drop announcements and keyboard behaviour:* announcements name the task and Bucket (""Seed Todo 01" moved to Week 43 (19-25)."). One arrow press moves about one column (Inbox → This week in 3 presses, DB checked). The prototype switcher no longer steals arrow keys.
- Tab order on the phone is logical (header → Wrap up → Add → per card: done, title, Move, Drag), with visible focus throughout.
- Pick mode routes focus to the first target and back on Escape. The source Bucket is disabled as a target.
- `h1`, named regions and lists, named "Add task to <Bucket>" buttons, and a persistent polite live region for pick mode.

## Recommended Actions

1. **[P1] `$impeccable colorize`**: AA-safe primary for text fills; tokenised Bucket colours with checked pairs, light and dark.
2. **[P1] `$impeccable adapt`**: 200% text on the phone (strip and header reflow).
3. **[P2] `$impeccable layout`**: restore tags and category colour on variant A cards.
4. **[P2] `$impeccable harden`**: pick-mode state on the strip; source-Bucket reason.
5. **[P2] `$impeccable polish`**: fold variant A into the board; remove B, C, the switcher, and `?variant`.
6. **[P3] `$impeccable animate`**: reduced-motion scrolling.
7. `$impeccable polish`

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `$impeccable audit` after fixes to see your score improve.
