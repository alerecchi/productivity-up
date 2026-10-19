# `/impeccable audit`: board (step 3)

Target: `/board` (today's board) and `/board?variant=A` (the picked prototype). Source: `src/features/board/components`, `src/features/board/prototype`. Report format from `reference/audit.md`; this audit documents issues and fixes nothing.

Evidence: `.verify/journeys/audit.ts` (Chromium via Playwright, emulated viewports 390×844 and 1440×900, mouse and keyboard; **touch gestures not synthesized**, the harness context has no `hasTouch`), and `impeccable detect --json src/features/board src/features/shared/components`. A rendered `detect` URL scan was not possible because `/board` requires a session the detector cannot carry.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1 | Today's board: completion checkbox invisible (`opacity: 0`) until hover and unnamed; drag announcements read raw ids ("Draggable item todo-1 was moved over droppable target bucket-1-insertion-1") |
| 2 | Performance | 3 | No issues of note; five suspense queries, no layout thrash |
| 3 | Theming | 2 | Column colours hard-coded (`text-slate-900` … `text-green-900`): dark-mode heading measured `oklch(0.208 …)` on `oklch(0.14 …)` |
| 4 | Responsive Design | 2 | Today's board: 69 of 69 controls under 44 px at 390 wide, 25 under 24 px (drag handle 24×24 at 0.7 opacity, checkbox 20×20); variant A meets 2.5.8 |
| 5 | Implementation Integrity | 2 | Prototype switcher steals ←/→ during keyboard drag; detector `side-tab` on the card's category stripe |
| **Total** | | **10/20** | **Acceptable (significant work needed)** |

## Implementation Integrity Verdict

**Fail for today's board, pass with issues for variant A.** Today's board relies on hover for a primary action and has no usable keyboard path between Buckets. Variant A brings a coherent no-drag path (Move → place), 44 px touch targets, named checkboxes and a polite move confirmation. But it still shares the generic dnd-kit announcements, and its keyboard drag can't leave the source Bucket either. Detector: 5 × `side-tab` (`border-l-4`), at `todo-card.tsx:44`, `migration-flow.tsx:357`, and three in `todo-card.test.tsx` (test fixtures, false positives).

## Executive Summary

- Audit Health Score: **10/20** (Acceptable)
- Issues: P0 0 · P1 6 · P2 4 · P3 2
- Top issues:
  1. Completion checkbox hidden until hover and without an accessible name (today's board).
  2. Drag-and-drop announcements expose internal ids; no Bucket or todo names.
  3. Keyboard drag moves 10 px per arrow press, so it never reaches another Bucket.
  4. Touch targets below 24 px on today's board (drag handle, checkbox).
  5. The prototype switcher's global ←/→ listener navigates away mid keyboard drag.
- Next steps: fix the P1s (harden / adapt), then polish.

## Detailed Findings by Severity

**[P1] Completion checkbox hidden until hover, no accessible name**
- Location: `todo-card.tsx` (Checkbox `opacity-0 … group-hover:opacity-100`, `id="terms-checkbox-…"`)
- Category: Accessibility / Responsive
- Impact: touch users see no way to complete a todo, and a screen reader announces only "checkbox".
- WCAG: 4.1.2 Name, Role, Value; 1.4.13/2.1.1 (hover-only affordance); 2.5.8
- Recommendation: always visible; `aria-label` naming the todo; 24 px+ target, 44 px on touch.
- Suggested command: `$impeccable harden`

**[P1] Drag announcements use raw ids**
- Location: `todo-drag-drop-provider.tsx` (default dnd-kit `Accessibility` plugin)
- Category: Accessibility
- Impact: screen-reader users hear "Draggable item todo-6 was moved over droppable target pick-column-1" and can't tell what or where.
- WCAG: 4.1.3 Status Messages (meaningful content)
- Recommendation: configure announcements with the todo title and Bucket name, and instructions that mention the Move alternative.
- Suggested command: `$impeccable harden`

**[P1] Keyboard drag cannot change Bucket**
- Location: `todo-drag-drop-provider.tsx` (default `KeyboardSensor`, `offset: 10`)
- Category: Accessibility
- Impact: Space then ArrowRight ×3 left the todo in Inbox on both boards (DB checked). The keyboard drag is effectively broken. Variant A's Move button is a working alternative; today's board has none.
- WCAG: 2.1.1 Keyboard
- Recommendation: a horizontal step of about one column width; keep the Move path as the primary keyboard method.
- Suggested command: `$impeccable harden`

**[P1] Touch targets below 24 px (today's board)**
- Location: `todo-card.tsx` drag handle `size="icon-xs"` (24×24, `opacity-70`), checkbox `size-5`
- Category: Responsive / Accessibility
- Impact: hard to hit on a phone, and the handle reads as disabled.
- WCAG: 2.5.8 Target Size (Minimum)
- Recommendation: 44 px on coarse pointers, at least 24 px (36 px) on fine pointers.
- Suggested command: `$impeccable adapt`

**[P1] Prototype switcher hijacks arrow keys**
- Location: `prototype-switcher.tsx` (window `keydown` ←/→)
- Category: Implementation Integrity / Accessibility
- Impact: during a keyboard drag, ArrowRight navigates to the next variant.
- WCAG: 2.1.4 Character Key Shortcuts (spirit), 2.1.1
- Recommendation: only react when focus is on the page body or the switcher itself.
- Suggested command: `$impeccable harden`

**[P1] Dark-mode Bucket headings fail contrast**
- Location: `bucket-column.tsx` `bucketStyles` (`text-*-900`, `bg-*-900/50`)
- Category: Theming
- Impact: Bucket names nearly vanish in dark mode.
- WCAG: 1.4.3 Contrast (Minimum)
- Recommendation: dark variants or tokens.
- Suggested command: `$impeccable colorize`

**[P2] Five identical "Add todo" buttons**
- Location: `create-todo-button.tsx`
- Category: Accessibility
- Impact: a screen-reader button list shows "Add todo" five times with no Bucket.
- WCAG: 2.4.6 / 2.4.9
- Recommendation: `Add todo to <Bucket>`.
- Suggested command: `$impeccable clarify`

**[P2] Variant A "Moving …" live region is mounted with its content**
- Location: `variant-a-pick-and-place.tsx` `PickedBanner` (`aria-live` element created on pick)
- Category: Accessibility
- Impact: some screen readers don't announce live regions inserted already filled.
- Recommendation: a persistent live region whose text changes.
- Suggested command: `$impeccable harden`

**[P2] No `h1` on the board**
- Location: `board.tsx`
- Category: Accessibility (semantic structure)
- Impact: heading navigation starts at h2.
- Recommendation: a visually hidden or visible page heading.
- Suggested command: `$impeccable harden`

**[P2] App-shell controls 36 px**
- Location: app header (logo link 32 px tall, "Board" 36, user menu 36), "Complete day" 36, "Add todo" 36
- Category: Responsive
- Impact: passes AA (≥ 24 px) but is below the 44 px comfort size on a phone.
- Recommendation: 44 px on coarse pointers.
- Suggested command: `$impeccable adapt`

**[P3] Category stripe flagged as side-tab**
- Location: `todo-card.tsx:44` (`border-l-4`), `migration-flow.tsx:357`
- Category: Implementation Integrity (detector)
- Impact: visual tell, not a usability defect. The stripe carries the category colour, a theme decision outside this audit's scope.
- Suggested command: `$impeccable quieter` (when the theme is decided)

**[P3] Picked-card scale transition ignores reduced motion**
- Location: `variant-a-pick-and-place.tsx` (`scale-[1.01]` with `transition-[box-shadow,transform]`)
- Category: Accessibility (motion)
- Recommendation: `motion-reduce:` keep the ring, drop the scale.
- Suggested command: `$impeccable animate`

## Patterns & Systemic Issues

- Today's board was built for a mouse: hover reveal, 24 px controls, and drag as the only way to move.
- Accessibility text that comes from libraries (dnd-kit) is left at its defaults.
- Colour is hard-coded per Bucket instead of tokenised, so dark mode breaks.

## Positive Findings

- Variant A: every todo control is named after its todo ("Mark "X" as done", "Move "X"", "Drag "X""). Controls are 44 px on touch and 36 px on fine pointers. Pick mode moves focus to the first target, and Escape returns it to the card. A no-drag path covers WCAG 2.5.7. Moves are confirmed in a polite toast.
- Sections are `aria-labelledby` their headings; lists use `ul`/`li`; there is no horizontal page overflow at 390 px.
- Tokens are used throughout variant A, and dark mode holds there.

## Recommended Actions

1. **[P1] `$impeccable harden`**: checkbox visibility and name, dnd announcements, keyboard drag step, switcher arrow keys, live region, h1.
2. **[P1] `$impeccable adapt`**: drag handle and checkbox target sizes on today's board.
3. **[P1] `$impeccable colorize`**: dark-mode Bucket colours.
4. **[P2] `$impeccable clarify`**: "Add todo to <Bucket>".
5. **[P3] `$impeccable animate`**: reduced-motion picked state.
6. `$impeccable polish`

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `$impeccable audit` after fixes to see your score improve.
