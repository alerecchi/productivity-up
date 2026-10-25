# Design System

## Creative North Star

**Everything leans toward today.**

The voice follows a second idea, **"a helpful co-pilot"**: the interface stays out of the way of the work. Personality comes from lively colour, motion and copy, and it is strongest at the moments that matter (a todo completed, Today cleared, Today empty, a period ending).

**Don't** make it look like a corporate project-management tool. The design must not slide into a generic SaaS template.

## Theme, Components

- **The Theme-First Rule.** Use a theme token when one fits the meaning; otherwise pick from the Tailwind palette; arbitrary values only as a last resort.
- **The shadcn-First Rule.** Every component is a shadcn/ui component from `src/features/shared/components/ui`. If shadcn has the component but the project doesn't, install it. Build a custom component only when shadcn has nothing that fits, and compose it from shadcn parts and theme tokens. Never use Base UI directly.
- **Light and Dark Theme are both first class citizen.**

## Layout

- **Every screen works on phone and desktop.** No device is locked to one job. Phone layouts show one thing at a time and switch with tabs or navigation rather than shrinking a desktop layout.
- **Flat design.** Depth comes from tonal layering, not shadows. Dialogs and popovers use their shadcn defaults; a stronger shadow appears only on something being dragged.
- **The Distinct Layers Rule.** Background, grouping surface and card must be distinguishable in every theme.

### Forms

Forms use TanStack Form with shadcn fields.
