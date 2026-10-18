# Installable agent skills for UI, UX, copy, and accessibility work

Research date: 2026-10-18. Answers issue #140 (child of map #137).

## Decision summary

Install four skills from **`jakubkrehel/skills`**: `better-accessibility`, `better-writing`, `better-colors`, and `better-typography`. They are the only candidates that fill the three gaps the installed skills leave: an accessibility review tied to WCAG 2.2 criteria, UX copy review built around a consistent vocabulary, and a colour and token system with measured contrast. They contain only Markdown. There are no scripts, no binaries, and no runtime network fetches. They also defer to the project's own documents instead of imposing a stack.

Do **not** install the rest of the shortlist. Read some of them as reference material instead:

- **`vercel-labs/agent-skills@web-design-guidelines`** is a good rule list, but the skill downloads its rules from a branch at review time. Use the rules as input to the design guide instead of installing a skill that is not pinned.
- **`pbakaus/impeccable`** is the most complete design skill available, but it is heavy. It runs a downloaded binary, can install edit hooks, and writes its own `PRODUCT.md` and `DESIGN.md`, which would compete with the design-guide skill that map #137 plans. Its `clarify` and `onboard` references are worth reading while writing the copy deck and designing the first-run experience.
- Skip `ui-ux-pro-max`, `taste-skill`, Anthropic's `design` plugin skills, `ux-writing`, `ibelick/ui-skills`, and `marketingskills`. The reasons are in the table below.

None of these replaces the installed skills. `frontend-design` still owns aesthetic direction, `shadcn` owns component mechanics, and `prototype` owns UI variations.

## What the installed skills already cover

| Skill | Source | Covers | Leaves open |
| --- | --- | --- | --- |
| `frontend-design` | `anthropics/skills` | Aesthetic direction, typography and palette choices that don't look templated, grounding the design in the subject | Accessibility rules, UX copy, token structure, contrast measurement |
| `shadcn` | `shadcn/ui` | Adding, composing, and styling shadcn components; registries and presets | Design judgement, copy, accessibility review |
| `prototype` | `mattpocock/skills` | Throwaway UI variations on one route, switched with a search param | What makes a variation good or accessible |
| `writing-for-agents` | local | Writing skills and AGENTS.md (needed for the planned design-guide skill) | User-facing copy |
| `find-skills` | `vercel-labs/skills` | Discovery through `npx skills find` and skills.sh | — |

Sources: local `~/.claude/skills/*/SKILL.md` and `~/.agents/.skill-lock.json`.

## How candidates were found and judged

Candidates came from `npx skills find` (the skills.sh index) with the queries accessibility, wcag, web design guidelines, ui ux, design system, ux writing, microcopy, copywriting, and brand. Each shortlisted `SKILL.md` was read from its repository. Repository metadata (stars, last push, licence, owner) came from the GitHub REST API. The skills.sh page for each skill reports three third-party security scans: Gen Agent Trust Hub, Socket, and Snyk.

The trust criteria were: who the author is, whether the repository is maintained, what the skill actually tells the agent to do (scripts, network, hooks, files it writes), whether its rules are correct, and whether it conflicts with AGENTS.md. One example of such a conflict is AGENTS.md's "never use BaseUI components directly".

## Shortlist

| Skill | Adds | Trust | Verdict |
| --- | --- | --- | --- |
| `jakubkrehel/skills`: `better-accessibility`, `better-writing`, `better-colors`, `better-typography` (also `better-layout`, `better-ui`, and the orchestrators `better-interface` and `interface-review`) | WCAG 2.2 A/AA review that cites criteria; copy review starting from an inventory of existing terms; OKLCH ramps, semantic token naming, measured contrast | Jakub Krehel, design engineer (jakub.kr, publisher of interfaces.dev). MIT, about 8k stars, pushed 2026-10-13. Markdown only. Each skill has 27k–36k installs. skills.sh: all three scans pass for `better-accessibility` | **Install** the four named skills |
| `vercel-labs/agent-skills@web-design-guidelines` | A dense rule list: a11y, focus, forms, motion, touch and drag, dark mode, i18n, copy | Vercel org, about 33k stars, 750k installs. Socket: Warn. The skill fetches `vercel-labs/web-interface-guidelines/main/command.md` at runtime, so the rules can change silently | **Don't install.** Use it as a source for the design guide |
| `pbakaus/impeccable` | 25 subcommands: shape, critique, audit, clarify, onboard, harden, typeset, colorize, and more; Operate vs Persuade surface modes | Paul Bakaus (created jQuery UI, works at Google). Apache-2.0, about 83k stars, very active. Runs a launcher that downloads a platform binary from GitHub releases, checked only against a `.sha256` file from the same release. Optional edit hooks. Writes PRODUCT.md and DESIGN.md. Socket: Warn | **Don't install now.** Read `clarify.md`, `onboard.md`, and `operate.md` as reference. Revisit if the design-guide skill turns out thin |
| `addyosmani/web-quality-skills@accessibility` | Lighthouse- and axe-led WCAG 2.2 audit workflow | Addy Osmani. MIT, about 3k stars | Optional alternative. It overlaps with `better-accessibility` and is less specific to components |
| `anthropics/knowledge-work-plugins` `design` plugin (`ux-copy`, `accessibility-review`, `design-critique`, `design-system`) | Short checklists | Anthropic org, Apache-2.0. All scans pass | **Skip.** Too thin, and `accessibility-review` targets WCAG 2.1 and lists 2.5.5 (44px targets) as AA, but it is AAA |
| `nextlevelbuilder/ui-ux-pro-max-skill` | A searchable CSV catalogue of styles, palettes, and font pairings, plus a Python search script | Org created 2025-11, about 137k stars. All scans pass | **Skip.** Choosing a design from a catalogue is the templated approach `frontend-design` exists to avoid |
| `Leonxlnx/taste-skill` (`brandkit`, `gpt-taste`, …) | Anti-slop landing page styles and brand-board image generation | Account created 2025-07. The README is sponsor-heavy | **Skip.** Built for premium marketing visuals and image generation, not an app people use for tasks |
| `ibelick/ui-skills` (`baseline-ui`, `fixing-accessibility`) | Short anti-slop and a11y rules | Julien Thibeaut. MIT, about 10k stars | **Skip.** `baseline-ui` requires `motion/react` (a new library) and prefers Base UI primitives, which clashes with AGENTS.md. `fixing-accessibility` is a subset of `better-accessibility` |
| `content-designer/ux-writing-skill` | UX-writing frameworks and reading-level targets | Unknown author (11 followers), about 240 stars, last push 2026-05 | **Skip.** Low trust, and `better-writing` covers it |
| `coreyhaines31/marketingskills@copywriting` | Conversion copywriting for landing pages | Corey Haines. MIT, about 55k stars | **Skip for now.** Revisit only when writing the landing page copy |

Sources: each repository's `SKILL.md` on GitHub (paths below); skills.sh skill pages; GitHub REST `repos/*` and `users/*`.

## Why `jakubkrehel/skills` fits this map

- **Accessibility rules in the design guide.** `better-accessibility` sets the bar at WCAG 2.2 A/AA. It treats 44px and 40px targets as heuristics and uses 2.5.8's 24×24px as the AA floor. It requires a single-pointer alternative to drag (2.5.7) and checks focus not obscured by sticky headers (2.4.11). The map's drag-and-drop alternative and its touch-target rules map directly onto these criteria. [SKILL.md](https://github.com/jakubkrehel/skills/blob/main/skills/better-accessibility/SKILL.md)
- **User-facing vocabulary.** `better-writing` starts by inventorying the nouns and verbs already in use. It allows one term per concept and flags only real inconsistency or ambiguity, not differences of taste. That is the audit the copy deck needs for words like "migration" and "carry forward". [SKILL.md](https://github.com/jakubkrehel/skills/blob/main/skills/better-writing/SKILL.md)
- **Brand tokens.** `better-colors` defaults to OKLCH, splits primitives from semantic role tokens, and never reports a contrast value it did not measure. That matches shadcn and Tailwind v4 CSS variables and the light/dark theme requirement. [SKILL.md](https://github.com/jakubkrehel/skills/blob/main/skills/better-colors/SKILL.md)
- **Respects project rules.** `better-interface` reads AGENTS.md, CLAUDE.md, and design-system docs before judging, and writes fixes in the project's own idiom. So the planned design-guide skill can override it. [SKILL.md](https://github.com/jakubkrehel/skills/blob/main/skills/better-interface/SKILL.md)

`better-layout`, `better-ui`, and the `better-interface` and `interface-review` orchestrators are optional. Add them only if the four-skill subset proves useful. The skills refer to each other by name ("contrast belongs to `better-colors`"), so installing only some of them leaves a few cross-references that point nowhere. That is harmless.

## Install recommendation

Install at project scope, so the skills are versioned with the repository and visible to every agent that works on the map. Review the diff whenever they update:

```sh
npx skills add https://github.com/jakubkrehel/skills --skill better-accessibility
npx skills add https://github.com/jakubkrehel/skills --skill better-writing
npx skills add https://github.com/jakubkrehel/skills --skill better-colors
npx skills add https://github.com/jakubkrehel/skills --skill better-typography
```

Command form from the skills.sh install box. This research did not install anything.

Once the design-guide skill exists, check for overlap. If the project guide restates the same rules, keep the third-party skills as reviewers and let the project skill be the source of truth for voice, vocabulary, and tokens.

## Caveats

- Star counts and install counts measure popularity, not quality. Several high-star repositories (`ui-ux-pro-max`, `taste-skill`) are less than a year old.
- The skills.sh security scans were checked only for `better-accessibility`, `impeccable`, `web-design-guidelines`, `ui-ux-pro-max`, and Anthropic's `ux-copy`. A "Pass" there is a static scan, not a review of the content.
- Some guidance conflicts between candidates. Vercel's guidelines ask for Title Case on buttons and "&" over "and", while `better-writing` defaults to sentence case. The design guide should choose explicitly.

## Primary sources

- `jakubkrehel/skills`: https://github.com/jakubkrehel/skills (skills/better-*/SKILL.md)
- `vercel-labs/agent-skills` web-design-guidelines: https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md; rules: https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md
- `pbakaus/impeccable`: https://github.com/pbakaus/impeccable/blob/main/.claude/skills/impeccable/SKILL.md and `scripts/impeccable` launcher
- `anthropics/knowledge-work-plugins` design plugin: https://github.com/anthropics/knowledge-work-plugins/tree/main/design/skills
- `nextlevelbuilder/ui-ux-pro-max-skill`: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- `Leonxlnx/taste-skill`: https://github.com/Leonxlnx/taste-skill
- `ibelick/ui-skills`: https://github.com/ibelick/ui-skills
- `addyosmani/web-quality-skills`: https://github.com/addyosmani/web-quality-skills
- `content-designer/ux-writing-skill`: https://github.com/content-designer/ux-writing-skill
- `coreyhaines31/marketingskills`: https://github.com/coreyhaines31/marketingskills
- skills.sh index and per-skill security audits: https://skills.sh/
- WCAG 2.2 (2.5.5 is AAA; 2.5.8 is the AA target-size criterion): https://www.w3.org/TR/WCAG22/
