# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ordinary adults juggling work and personal life. They are comfortable with apps but are not productivity enthusiasts; knowledge workers are a natural overlap. Everything must make sense to someone who has never heard of GTD.

The phone is for today and quick capture: working in Today (or This week) and moving a few todos down a horizon. The desktop is for planning across horizons: seeing every Bucket at once.

## Product Purpose

Productivity Up is a todo app that organises todos in time-based Buckets (Inbox, this year, this month, this week, today). Todos flow from broader Buckets toward narrower ones as they become more immediate. The core promise is *from someday to today*: big intentions gradually become today's short list. The emotional benefit is a calmer to-do list.

## Positioning

A kanban board whose columns are time horizons, not workflow states. Moving a todo means deciding *when*, not *what stage*. Unfinished todos from a past period are normal, not failures; the app helps you decide where they go next (Bucket Migration) instead of flagging them as overdue.

## Operating Context

- The board (`/board`) is the main surface: Buckets in a fixed order, Inbox → year → month → week → day.
- The day can be completed early, which moves the Planning Date to tomorrow ("planning ahead").
- When a period ends with incomplete todos, a Completion Recap and a Migration Flow ask the user to carry each todo forward or move it back to a broader Bucket.
- Domain vocabulary lives in `GLOSSARY.md` (Bucket, Bucket Horizon, Planning Date, Migration, etc.). Glossary terms are code language; user-facing copy should stay plain.

## Capabilities and Constraints

- TanStack Start web app on Cloudflare Workers; shadcn/ui on Tailwind v4; @dnd-kit/react for drag and drop; TanStack Form for all forms (see AGENTS.md).
- English only at launch; avoid idioms so translation stays cheap.
- Undecided: theme (shape, typeface, colour system, "Up" family mark) is owned by a separate theme prototype. A dark theme exists in tokens but has no user-facing switch.

## Brand Commitments

- Name: "Productivity Up" for now (may be renamed cheaply; "Plan Up" is a candidate). "Up" is meant to become a family of apps with a shared mark plus a per-app accent.
- Personality: calm, warm, lightly playful, minimal, quietly encouraging.
- Voice: warm, gives a next step, and gives permission to stop. Reference: "Nothing left for today. Pull something down from this week, or take the evening off."
- Never: a corporate project-management tool, hustle-culture productivity, guilt mechanics (streaks, red overdue badges, nagging), a generic SaaS template.
- Colour carries meaning, not decoration: Bucket nearness (far = quiet, Today = vivid) must coexist with category and tag colours.

## Evidence on Hand

- UI inventory with screenshots and copy: `docs/ux/inventory/` on the inventory workspace (issue #144).
- No testimonials, customers, or metrics exist; do not fabricate any.

## Product Principles

1. From someday to today: every surface should make it easy to pull work toward a narrower horizon.
2. Calm over urgent: unfinished work is normal; never shame.
3. Phone for today, desktop for planning.
4. Plain words over domain jargon.

## Accessibility & Inclusion

WCAG 2.2 AA, including 2.5.7 (dragging movements need a single-pointer alternative) and 2.5.8 (target size). Everything must work with a keyboard and a screen reader.
