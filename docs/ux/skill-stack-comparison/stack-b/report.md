# Stack B report: `pbakaus/impeccable` 4.6.0 + `/prototype`

Comparison for [#150](https://github.com/alerecchi/productivity-up/issues/150). Workspace `stack-b`, based on `main` at `be9022d`. Model: Claude Opus 5.5. App run via `pnpm verify up --port 3120` as `seed_user_with_data`.

Screenshots per step live in `step<n>/`, named `variant-<key>--<mobile|desktop>--<light|dark>.png` (390×844 and 1440×900; dark = `.dark` class added by hand, the app has no theme switch; the dev-only TanStack devtools launcher is hidden).

## Setup

- `.claude/skills/impeccable/` (66 files) and `skills-lock.json` were already in the workspace. They are committed separately as "Install stack B skills". `scripts/data/font-index.json` (1.1 MB) is over jj's 1 MiB snapshot limit and stays untracked. jj warns about it on every command.
- No `frontend-design` skill is visible in this session.

## Step 1: new screen (`/impeccable shape` → `/prototype`)

**Time:** 17:49 start (read issue) · 18:03 skills invoked · 21:48 screenshots done. Most of the wall-clock time went to waiting on the decision page (see Friction).

**Skills and commands invoked**

1. `Skill impeccable` with "shape the /board screen rework…" and `Skill prototype` (UI branch, sub-shape A).
2. `impeccable context --target src/routes` (setup step 1, ~3 s). Output: `NO_PRODUCT_MD` + `BUILD_INIT_REQUIRED`. shape cannot run until `init` writes PRODUCT.md "with the human". It also printed `MANUAL_DETECTOR_REQUIRED` (run `impeccable detect` when the UI is done) and an `AUTONOMY_DIRECTIVE_CHECK` telling the agent to probe the user rather than assume they are absent.
3. Loaded `reference/shape.md` → `reference/init.md` → `reference/new-work.md` (60 KB; it overflowed the tool output and had to be read from a spill file) → `reference/craft-floor.md` + `reference/operate.md` before editing.
4. **init + shape interview** (structured question tool, one round, three questions). Asked the user:
   - "PRODUCT.md from #138's resolution + GLOSSARY.md, platform web: correct?" → *Use #138 + glossary*
   - "The job: phone = Today/this week and quick moves, desktop = full planning overview; success = non-drag moves, always know where you are, full keyboard/SR. Correct?" → *Yes*
   - "Fidelity: real mutations, board surface only, dialogs/header/migration untouched?" → *Real mutations, board only*
5. Wrote `PRODUCT.md` (init's template: Users, Purpose, Positioning, Operating Context, Capabilities, Brand Commitments, Evidence, Principles, Accessibility).
6. `impeccable concept-seed --help` accidentally **ran a roll** (there is no help flag). It made a network call to the impeccable catalog API ("source: api").
7. `impeccable concept-seed --scope surface --mode operate --candidate-count 7`: a dice roll over the agent's own ranked list of 7 grounded board structures. It dealt indices **7, 2, 6** (7 leads) and printed 6 catalog "challenger" worlds: a jet-age ticket wallet, a zoo guide map, a Crouwel grid specimen, labanotation, a doujin catalog, and a variable-font specimen. It also printed MODE RULES for Operate and a telemetry instruction (an anonymous ping of the chosen card kind).
   - The agent's ranked list was: 1 bottom-tab focus view + Move sheet · 2 horizon ladder with Sooner/Later steps · 3 swipe carousel · 4 two-pane source→target split · 5 multi-select + action bar · 6 Today-first with a pull-from drawer · 7 pick up and place (tap to pick, tap a Bucket strip to place).
   - All challengers were declined, because the brief pins today's theme and the mode rules say a world may lend only type, palette, density, and one signature move. Surface rounds only show challengers that win, so none were shown.
8. `impeccable serve-question --schema` then `--start --payload .impeccable/mocks/decision/payload.json`. This started a local **decision page** (http://127.0.0.1:56272) with 3 equal cards, each with a 390×844 HTML sketch the agent wrote into `.impeccable/mocks/decision/*.html`. The agent then had to block on `serve-question --wait --key …` (exits 3 every 60 s; looped in the background). **At the end of step 1 the page was still unanswered.**
9. `/prototype`: built the three dealt structures as `?variant=A|B|C` on the real `/board`, plus the floating switcher.
10. `impeccable detect --json src/features/board/prototype src/features/shared/components/prototype-switcher.tsx` → `[]` (no findings).

**Shape brief (what shape returned, confirmed via the interview)**

- *Job and audience:* ordinary adults; on a phone they work in Today/this week and move a few todos down a horizon, on desktop they plan across every Bucket. Mode: Operate.
- *Outcome:* move todos without dragging, one-handed; always know the current Bucket and reach any other in one step; full keyboard/SR; WCAG 2.2 AA 2.5.7/2.5.8; desktop keeps the full kanban.
- *Direction:* established world (today's theme); compose only. Three dealt structures (below).
- *Scope:* real data and mutations; only the board surface changes; header, todo dialog, recap/migration untouched.
- *Constraints:* shadcn components, TanStack Form, English without idioms, no guilt mechanics.

**Variants** (`http://localhost:3120/board?variant=…`; no param = today's board)

| Key | Name | Phone | Desktop | No-drag move | Drag |
|---|---|---|---|---|---|
| A | Pick up and place | One Bucket fills the screen; a 5-tab Bucket strip with counts in the thumb zone (`aria-current`) | Five equal columns | Tap ⇄ Move on a card → banner "Moving …" → the tab strip (or "Move here" in each column) becomes the target; Escape cancels | Grip onto a tab or column |
| B | Horizon ladder | One vertical list, nearest first (Today → Inbox), sticky section headers, a jump-chip bar that tracks the visible section | Kanban with column dividers | One-step "↑ This week / ↓ Today" buttons on every card + "Move to…" menu | Grip onto a chip or column |
| C | Today first, pull from above | shadcn Tabs for the focused Bucket (Today by default); a collapsible "Pull from this week" panel at the bottom with source chips and a "↓ Today" pull button per todo | Broader Buckets as narrow columns; the focused Bucket pinned wide on the right | "↓ Today" pull button + Move menu (→) | Grip onto the focused pane or a column |

All three share: a 44 px completion checkbox with a named label (`Mark "X" as done`), 44 px controls, the real todo dialog on title tap, and a polite toast "Moved "X" to This week" after a no-drag move.

**Verified in the real app** (`.verify/journeys/variant-moves.ts`, `variant-drag.ts`, both PASS, DB checked with `sql()`): A pick-and-place on the phone, B step button, C pull button and Move menu, pointer drag onto a desktop column and onto a phone tab. Keyboard drag and screen-reader announcements were not checked (that is step 3).

**Files** (`jj diff --stat`, excluding screenshots): `PRODUCT.md` (new, by init) · `.impeccable/mocks/decision/{payload.json,*.html}` (decision page inputs) · `src/features/board/prototype/{board-prototype-shared,variant-a-pick-and-place,variant-b-horizon-ladder,variant-c-today-first,variants}.tsx` · `src/features/shared/components/prototype-switcher.tsx` · `src/features/shared/components/ui/dropdown-menu.tsx` (shadcn add) · `src/features/board/components/board.tsx`, `src/routes/_authenticated/board.tsx` (variant wiring). 1,586 insertions.

**Friction**

- **Mandatory init before shape.** The launcher refuses to shape without PRODUCT.md and requires an interview round with the user. This cost one question round, which was quick because #138 already had the answers.
- **Binary and network.** `scripts/impeccable` is a shell launcher that runs a self-contained binary. No download happened, and no new files appeared in `~/.cache` or `~/.impeccable`. `concept-seed` calls a remote catalog API on every roll and asks the agent to send an anonymous telemetry ping once the round resolves (not sent, because the round never resolved).
- **The concept-seed "dice"** override the agent's ranking (the roll led with the agent's #7). The process is long (new-work.md is 60 KB of dense rules), and it is designed for picking *one* direction, which conflicts with `/prototype`'s three-variant build. Resolution: the dealt three became the three variants, and the decision page doubled as shape's confirmation step.
- **Decision page.** It needs the user to open a localhost page and click. The agent has to hold a blocking `--wait` loop (exit 3 every 60 s). Unanswered after about 2 hours, so step 1 ends with the page still open, and the user's variant pick below is the real answer.
- **Extra files the skill created:** `PRODUCT.md`, `.impeccable/mocks/decision/` (payload + 3 HTML sketches). No DESIGN.md (new-work only writes it at the finish of a full build).
- **Tooling outside the skill:** `shadcn add dropdown-menu sheet` resolved the `utils` alias wrongly, rewrote the import to `from "cn"`, and **installed an unrelated npm package `cn`**. The agent reverted it (`pnpm remove cn`, fixed the import) and dropped the unused `sheet`. The CLI also stopped at an overwrite prompt for `button.tsx` (answered no).
- No permission prompts appeared during this step.

**AGENTS.md compliance**

- `rg '@base-ui' src` outside `shared/components/ui`: none.
- Forms: no form code added (the todo dialog is reused as is).
- shadcn: `Button`, `Checkbox`, `Tabs`, `DropdownMenu` (newly added via the shadcn CLI). Hand-rolled: the Bucket tab strip (A), jump chips (B), the card title button, and the prototype switcher. These are plain `<button>`s styled with Tailwind. shadcn has `Tabs`/`ToggleGroup`, which could cover A's strip and B's chips; C uses shadcn `Tabs`.

### Step 1 outcome

- The decision page closed unanswered after about 2 h (`serve-question --wait` exit 4, "PAGE CLOSED"). Per new-work.md the agent re-presented the choice once through the structured question tool, which was also the script's "pick a variation" stop. **The user picked A, Pick up and place.**
- concept-seed asks for an anonymous telemetry ping (`--kind assigned`) once a round resolves. **Not sent:** it publishes data to a third party and the user hadn't approved it.

## Step 2: polish (`/impeccable polish`)

**Time:** 21:57 → 22:01 (about 4 min of agent work, plus about 2 min of journeys).

**Skills and commands invoked**

1. `Skill impeccable` with "polish the board variant A…". The skill says to run `impeccable context` once per session, so it was not rerun.
2. Loaded `reference/polish.md`. It opens with "**Additional context needed**: quality bar and shipping constraints". The agent **did not ask** and inferred it from the brief: a throwaway prototype, today's theme, shadcn, no new libraries.
3. `impeccable critique-storage latest src/features/board/prototype/variant-a-pick-and-place.tsx --json` → exit 2 (no prior critique).
4. Evidence pass, as the reference asks: drove variant A at 390, 768, 1024, and 1440 px, picked and unpicked, keyboard and mouse, dark (`.verify/journeys/a-states.ts`).
5. Re-read `craft-floor.md` before editing (already loaded in step 1).
6. `impeccable detect --json` on the changed files → `[]`.

**What polish found and fixed** (in the reference's triage order)

| Priority | Finding | Fix |
|---|---|---|
| 1 Blocked/misleading | Phone: the "Moving …" banner was truncated to "Moving" and covered by the prototype bar | Banner wraps; switcher moved up on phones |
| 1 Inaccessible path | Keyboard: after Move, focus stayed on the card, so reaching a Bucket meant tabbing through the whole list | Focus jumps to the first place target (tab or "Move here"); Escape returns focus to the card's Move button |
| 3 Hierarchy/responsive | Desktop: two 44 px controls squeezed titles onto two lines in five columns | On `md` + fine pointer, controls are 36 px (still ≥ 24 px for 2.5.8); touch keeps 44 px |
| 3 Local defect | Inbox showed "Inbox" twice (name + period label) | Hide the period label when it equals the name |
| 4 Theme | Dark: the dashed "Move here" border disappeared (`dark:border-input` won) | `dark:border-primary` |
| 4 Content | Long titles without spaces could overflow | `overflow-wrap: anywhere` |

- Not a defect: the pale picked Move button in one capture was `transition-all` caught mid-transition (computed bg alpha 0.03).
- Intentional exception (logged, not changed): the Bucket strip stays a custom `<nav>`, not shadcn `Tabs`. It switches from navigation to move targets while a todo is picked, and a tablist can't change role like that.
- Polish did **not** say to drop B, C, or the switcher, so they stay. The shared `TodoCheck` change (36 px on desktop) also applies to B and C.

**Verified:** `a-states.ts` (focus moves to "Move to Inbox" on the phone and to "Move here" on desktop), `variant-moves.ts` and `variant-drag.ts` re-run, all PASS.

**Files:** `variant-a-pick-and-place.tsx` (+35/−10), `board-prototype-shared.tsx` (1 line), `prototype-switcher.tsx` (1 line), and screenshots in `step2/` (plus two `extra-…picked` captures).

**Friction:** none beyond the unanswered "additional context" header. No prompts, downloads, or new files from the skill.

**AGENTS.md:** unchanged from step 1 (no Base UI imports outside `ui/`, no form code).

## Step 3: known defects (`/impeccable audit`, then fix)

**Time:** 22:01 → 22:16 (about 15 min, including one user question).

**Skills and commands invoked**

1. `Skill impeccable` with "audit the board (/board, default and ?variant=A; src/features/board/components and src/features/board/prototype): accessibility, touch targets, keyboard, screen reader, responsive". *Bias note:* the agent's argument named the audit's own dimension words. It did not name the three defects.
2. Loaded `reference/audit.md`: score 5 dimensions 0–4, P0–P3 findings, "don't fix issues; document them". The fixes below were done by the agent because the script asks for them; audit itself only recommends `harden`/`adapt`/`colorize`/`clarify`/`animate`.
3. `impeccable detect --json src/features/board src/features/shared/components` → 5 findings, all `side-tab` (`border-l-4`). A rendered URL scan (`detect <url>`) could not run, because `/board` needs a session.
4. Evidence journey `.verify/journeys/audit.ts` (written by the agent to the reference's checklist): target sizes, hidden controls, keyboard drag with Space and arrows, live-region text, headings, overflow, dark heading colour. First run invalid twice (measured before render; the prototype switcher hijacked ←/→), re-run with the switcher listener suppressed in the test page.
5. Report saved verbatim as [`step3/audit.md`](step3/audit.md): **10/20 (Acceptable)**, P1 ×6, P2 ×4, P3 ×2.

**Known defects: found by the audit on its own?**

| Known defect | Found? | How |
|---|---|---|
| Hover-only checkboxes | **Yes** (P1) | Checklist "Keyboard navigation / Missing ARIA" + measured `opacity: 0`, no name, on today's board |
| Small touch targets | **Yes** (P1, P2) | Checklist "Touch targets < 44px" + measured: 25 controls < 24 px on today's board; app-shell 36 px |
| DnD announcements and keyboard behaviour | **Yes** (P1 ×2) | Measured live-region text (raw ids) and a keyboard drag that never left Inbox |

The **detector found none of the three**; it only flagged the category stripe. All three came from the agent running the audit checklist against the live app. The agent knew the defects from the brief, so "on its own" is partly the checklist and partly the agent.

**Findings that are false, wrong, or out of scope**

- `side-tab` in `todo-card.test.tsx` (×3): false positives, the class strings are test fixtures.
- `side-tab` on the category stripe (`todo-card.tsx`, `migration-flow.tsx`): accurate as a craft-floor ban, but the stripe carries the category colour, a theme decision outside this comparison. Not fixed.
- The audit's 44 px threshold flags the 36 px app-shell controls, which pass WCAG 2.2 AA 2.5.8 (24 px). It is a comfort finding (P2), not a violation. Not fixed (app shell is outside board scope).
- The variant A checkbox measures 24×24 visually, but its hit area is 44 px (`after:-inset`). An automated size check would miss this; the audit text treats it as passing.
- One new finding the brief didn't anticipate: the **prototype switcher's ←/→ shortcut** steals arrow keys during a keyboard drag (real, fixed).

**Fixes applied**

| Finding | Fix |
|---|---|
| P1 checkbox (today's board) | Always visible; `aria-label` "Mark X as done / not done"; 24 px box with a 44 px (coarse) / 36 px (fine) hit area; dropped the leftover `terms-checkbox` id |
| P1 touch targets (today's board) | Drag handle `icon-xs` 24 px at 0.7 opacity → 44 px coarse / 36 px fine, full opacity; "Add todo" and "Complete day" 44 px on coarse pointers |
| P1 announcements | `Accessibility.configure` with named messages ("Picked up "X". Use the arrow keys to choose a Bucket.", "Over This week.", ""X" moved to Today.", "Move cancelled…") and instructions that mention the Move button; droppables carry `bucketName` |
| P1 keyboard drag | `KeyboardSensor.configure({ offset: { x: 310, y: 56 } })`: one arrow press moves about one Bucket column |
| P1 switcher arrows | Switcher ignores ←/→ unless focus is on the page body or the switcher |
| P1 dark headings | `dark:text-*-200` / `dark:bg-*-400/25` on the Bucket colours |
| P2 "Add todo" ×5 | "Add todo to <Bucket>" (optional `bucketName` prop; one test updated) |
| P2 live region | Variant A: a persistent `sr-only` polite region; the visible banner is `aria-hidden` |
| P2 no h1 | `sr-only` `<h1>Board</h1>` |
| P3 reduced motion | Picked card keeps the ring, drops the scale under `motion-reduce` |

**Verified after the fixes** (`audit.ts` re-run with the real switcher): 0 controls under 24 px on either board. The checkbox is visible (`opacity: 1`) and named. A keyboard drag from Inbox with ArrowRight ×3 lands in **This week** (DB `weekly`) with the announcement ""Seed Todo 01" moved to Week 43 (19-25)."; on variant A, ×2 lands in **This month**. The dark heading is `oklch(0.93 …)` on `oklch(0.14 …)`. `vitest run src/features/board`: 174/174 pass. `variant-moves.ts` and `variant-drag.ts` pass. **Untested:** real touch (Playwright reported a fine pointer, so the `pointer-coarse` 44 px sizes were not exercised) and a real screen reader (live-region text was read from the DOM).

**Friction**

- **User question:** the announcement fix needs `Accessibility` from `@dnd-kit/dom`, not re-exported by `@dnd-kit/react`. AGENTS.md requires approval for new libraries. The user approved, so `@dnd-kit/dom@0.5.0` was added as a direct dependency and listed in AGENTS.md.
- Audit's no-fix rule vs the script's "then fix": the agent applied the fixes itself instead of running the recommended `harden`/`adapt`/`colorize` commands.
- No prompts, downloads, or new files from the skill.

**Files:** `todo-card.tsx`, `bucket-column.tsx`, `create-todo-button.tsx`, `todo-drag-drop-provider.tsx`, `board.tsx`, `todo-edit-dialog.test.tsx`, `variant-a-pick-and-place.tsx`, `board-prototype-shared.tsx`, `prototype-switcher.tsx`, `package.json`, `pnpm-lock.yaml`, `AGENTS.md`, plus `step3/audit.md` and screenshots (244+/25−).

**AGENTS.md:** `rg '@base-ui' src` outside `ui/`: none. `@dnd-kit/dom` added with approval and listed. No form code.

## Step 4: copy pass (`/impeccable clarify`)

**Time:** 22:16 → 22:21 (about 5 min, plus one user question).

**Skills and commands invoked**

1. `Skill impeccable` with "clarify the board's strings (…board.tsx, bucket-column.tsx, todo-card.tsx, create-todo-button.tsx, todo-drag-drop-provider.tsx, use-move-todo.ts, and src/features/board/prototype)".
2. Loaded `reference/clarify.md`. It opens with "**Additional context needed**: audience knowledge and emotional state". Not asked, because PRODUCT.md (from #138) already records both.
3. Followed its "ask before changing … a term that may be domain-specific" rule with **one question to the user** (2 parts):
   - "Bucket" in UI copy? → **Avoid the noun** (use the Bucket's own name, or "list").
   - "todo" or "task"? → **"task"**.
4. Rewrote the strings by function (actions, errors, empty/success states, SR names), then read the flow in context on the real app (phone, desktop, empty board as `seed_user_without_data`).
5. No detector run in this step: nothing visual changed except text, and the reference doesn't call for one.

**Output:** the full before/after deck is in [`step4/copy.md`](step4/copy.md) (22 rows + the deliberate exclusions). Highlights:

- No raw keys or developer messages: the recap headline now reads "Monday 19 is wrapped up", and "Couldn't wrap up the day" replaces the server's `error.message`.
- One verb for ending the day ("Wrap up the day" / "is wrapped up"), and "task" everywhere.
- Empty states now give a next step and permission to stop: "Nothing left for today. Move something in from this week, or take the rest of the day off."
- No "Bucket" in UI copy: it uses each Bucket's name, "list" in announcements, and "Lists" as the nav name.

**Behaviour change to flag:** the complete-day error toast no longer shows the server's `error.message`. The existing test expected that pass-through ("Cannot complete day while Todos are incomplete"), so it was updated to the new generic message. That server error isn't reachable in the normal flow (incomplete todos return `migration_required`), but the "why" is now lost if it ever fires.

**Verified:** `vitest run src/features/board` 174/174 (test expectations updated to the new strings in 5 test files; no logic changes). `tsc`/`eslint` clean. `variant-moves.ts` and `variant-drag.ts` PASS. The copy was read in screenshots, including the empty board.

**Friction**

- A second "Additional context needed" header, again answered by PRODUCT.md.
- One user question (domain terms), as the reference requires.
- Copy changes ripple into tests: 5 test files needed new strings. The **project's verify skill** (`.claude/skills/verify-productivity-up/`) still documents old names (e.g. `'Inbox Todos'`, `'Drag <title>'`). It was not edited, because the brief forbids changing skills, so its feature map is now stale for this branch.
- No prompts, downloads, or new files from the skill.

**Files:** `board.tsx`, `bucket-column.tsx`, `todo-card.tsx`, `create-todo-button.tsx`, `todo-drag-drop-provider.tsx`, `use-move-todo.ts`, `use-update-todo.ts`, `board-prototype-shared.tsx`, `variant-a-pick-and-place.tsx`, 5 `*.test.tsx`, `step4/copy.md`, screenshots (4 + 2 empty-board extras).

**AGENTS.md:** no new components or libraries; no Base UI imports; no form code.
