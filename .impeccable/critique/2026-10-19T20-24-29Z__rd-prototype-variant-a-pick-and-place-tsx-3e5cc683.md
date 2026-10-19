---
target: board rework, variant A + today board (diff from main)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/alessandrorecchi/Documents/projects/productivity-up-stack-b/src/features/board/prototype/variant-a-pick-and-place.tsx"
target_fingerprint: "sha256:16b389bf82b1b43402ec8c2a7055b457de7b7e3fabf8c9a002f8cad6a15b5207"
target_path: /Users/alessandrorecchi/Documents/projects/productivity-up-stack-b/src/features/board/prototype/variant-a-pick-and-place.tsx
timestamp: 2026-10-19T20-24-29Z
slug: rd-prototype-variant-a-pick-and-place-tsx-3e5cc683
---
# `/impeccable critique`: the whole change from `main` (step 5)

Target: `src/features/board/prototype/variant-a-pick-and-place.tsx` (`/board?variant=A`, the picked design), plus today's `/board` as changed on this branch. Mode: Operate. Findings recorded, **not fixed** (step 5 rule).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Location, counts, moving banner and toast are clear; optimistic moves show no pending state |
| 2 | Match System / Real World | 3 | Plain names ("This week", "task"); "Planning for today" still unexplained |
| 3 | User Control and Freedom | 2 | Pick mode cancels (button, Escape) but moves and completions have no Undo |
| 4 | Consistency and Standards | 2 | Two boards on one route with different cards, controls and Bucket names ("Week 43 (19-25)" vs "This week"); B, C, switcher still shipped |
| 5 | Error Prevention | 3 | Source Bucket disabled as a target; nothing destructive on the surface |
| 6 | Recognition Rather Than Recall | 2 | Move (⇄) and Drag (⋮⋮) are icon-only, side by side on every card |
| 7 | Flexibility and Efficiency | 2 | Move + keyboard drag; no shortcuts or multi-select for planning sessions |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, but doubled move affordances ×N and two blue primaries at the top |
| 9 | Error Recovery | 3 | Toasts say what happened and what to do |
| 10 | Help and Documentation | 2 | Empty states guide; nothing explains what the horizons are for |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** partly authored. The thumb-zone Bucket strip with counts, "pick up and place" between horizons, and the brand-voice empty states ("…or take the rest of the day off") belong to this product. The rest is the category default: equal-weight white cards, one blue for every icon and button, and the five Buckets drawn identically. PRODUCT.md says colour should carry nearness (far = quiet, Today = vivid); variant A paints every Bucket icon `text-primary`, so "from someday to today" never shows up visually.

**Deterministic scan:** CLI `detect --json` on the 13 changed source files found **1** issue, `side-tab` at `todo-card.tsx:44` (`border-l-4` category stripe, carried over from `main`). The in-page overlay found **1** issue on variant A mobile, **26** on variant A desktop, and **31** on today's board at 1440. By rule:
- `low-contrast`: white on `#1770f9` = **4.4:1** (primary buttons: "Wrap up the day", "+"). Real, from the theme's `--primary` token, and the LLM review missed it. On today's board, the Bucket badge/icon pairs are 3.3–3.6:1 (`#4d179a` on `#a186c8`, `#1c398e` on `#8897c2`, `#7b3306` on `#b8947e`), and green `#008236` on `#e0f9ea` is 4.45:1. All real, also missed by A.
- `nested-cards` (every todo card inside a column panel, ×25): **false positive for this category.** Cards in a column panel are the kanban convention, and the column is a tinted region, not a card.
- `side-tab` (today's board): accurate to the craft-floor ban; the stripe carries category colour (a theme decision).
- `ai-color-palette` (violet `#4d179a` "This year" heading, today's board): matches the hard-coded Bucket colours from `main`, which the user hasn't chosen. Real but out of scope.

Agreement: both A and the detector see colour as the weak axis. A looks at meaning (nearness is invisible), the detector at contrast.

**Visual overlays:** injection succeeded through Playwright (`addScriptTag` from impeccable's live server on :8400). The overlay renders labelled boxes in the page; screenshots: `critique-overlay--variant-A--{mobile,desktop}.png`, `critique-overlay--today-board--desktop.png`. There is no persistent [Human] tab, because the harness browser is headless.

## Overall Impression

The rework solves the brief's mechanics: one-handed no-drag moves, always-visible location, keyboard and screen-reader paths, a full desktop overview. But it looks like any todo app. The biggest opportunity is to let colour and hierarchy show the horizon ladder the product is named after.

## What's Working

1. **A no-drag move that fits the thumb.** The bottom Bucket strip is both navigation and a target set; pick mode routes focus to the targets, and Escape returns it.
2. **Location is never lost.** aria-current tab, a large Bucket heading with date and task count, and counts on every tab.
3. **Voice.** Errors, empty states and announcements read calm and give a next step; there are no guilt mechanics.

## Priority Issues

- **[P1] Variant A shows less than today's board.** Why it matters: tags aren't rendered and the category is plain grey text, so the user loses the information they used to plan. Fix: a compact meta row with the category dot/colour and tags. Suggested command: `$impeccable layout`
- **[P1] Colour carries no meaning, and the primary fails contrast.** Why it matters: nearness, the product's core idea, is invisible, and white on `#1770f9` is 4.4:1 (below 4.5:1). Fix: a quiet-to-vivid ramp across the strip and headings that coexists with category colours; a darker primary for text-bearing buttons. Suggested command: `$impeccable colorize`
- **[P2] Doubled, icon-only move affordances.** Why it matters: ⇄ and ⋮⋮ on every card read as two unexplained icons, and first-timers can't tell pick-up from drag. Fix: one handle (tap = pick up, drag = drag), or label "Move" on touch. Suggested command: `$impeccable distill`
- **[P2] The phone's primary action is out of reach.** Why it matters: "Wrap up the day" and "+" sit at the top of an 844 px screen, competing as two blue primaries. Fix: place "Wrap up the day" at the end of Today's list, and keep "+" near the strip. Suggested command: `$impeccable layout`
- **[P2] No Undo.** Why it matters: a mis-tap on a tab moves a task with no way back except moving it again. Fix: Undo in the move/complete toast. Suggested command: `$impeccable harden`

## Persona Red Flags

**Casey (one-handed mobile):** the strip and Move are in reach; "Wrap up the day" and "+" are not. With no `?variant`, today's board still shows 320 px columns scrolling sideways.

**Jordan (first-timer):** ⇄ and ⋮⋮ are unlabeled. "Planning for today" gives no hint what planning means, and nothing says what Year / Month / Week are for.

**Sam (screen reader / keyboard):** named controls, focus routing, and named drag announcements work. In pick mode the tab buttons change meaning but only the `<nav>` name changes; the buttons announce no pressed/target state.

(AGENTS.md has no `## Design Context` section, so no project-specific personas.)

## Minor Observations

- Desktop pick mode inserts "Move here" above every column's cards, pushing the cards down by about 52 px.
- Tab-strip counts are 11 px.
- Today's board and variant A disagree on Bucket names.
- The magenta prototype switcher overlaps content on phones (a prototype tool, but it is in every capture).

## Questions to Consider

- What if the strip itself showed nearness, warming from Inbox to Today?
- Does a card need both Move and Drag, or is one handle enough?
- Should the phone open on Today with "Wrap up the day" at the end of the list, where the day actually ends?
