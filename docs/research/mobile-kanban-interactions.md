# Mobile interaction patterns for kanban boards and drag-and-drop

Research date: 2026-10-18. Ticket: #142, part of map #137.

## Question

Which interaction patterns work well for multi-column, kanban-style boards on phones, especially for moving items between columns? The scope covers:

- single-column, paged, and swipe layouts
- long-press drag compared with explicit "Move to…" actions
- bottom sheets
- touch targets, and gestures that conflict with scrolling
- accessible alternatives to drag-and-drop
- what `@dnd-kit/react` supports for touch and keyboard

## Summary

- **Every platform authority says the same thing: dragging cannot be the only way to move an item.** WCAG 2.2 SC 2.5.7 (AA) needs a single-pointer way to move items that does not involve dragging, and keyboard support alone does not satisfy it. Apple's HIG says to "offer alternative ways to accomplish drag-and-drop actions", such as menu commands. Atlassian's drag-and-drop guidelines put move actions in the item's "more" menu, or turn the drag handle into a menu button.
- **Well-known apps follow the same split on phones.** Things on iPhone supports dragging only within a list. Moving a to-do to another list goes through a **Move** button and a destination picker. Todoist's iOS context menu has **Move to…**. Trello and Jira mobile support long-press drag but keep a **Move** action, or a status dropdown, on the opened item. Phone boards show one column at a time and people swipe between columns (Jira, Todoist).
- **`@dnd-kit/react` 0.5 already handles touch reasonably.** Its default `PointerSensor` waits for a **250 ms press with 5 px tolerance** on touch, so normal scrolling still works. Once a drag starts, it blocks scrolling. A `KeyboardSensor` and an `Accessibility` plugin (live region, ARIA attributes, instructions) are on by default. The default announcements, however, name items by raw ids such as `todo-12`. Because this app uses `useDraggable` rather than `useSortable`, keyboard dragging moves the item in 10 px steps instead of jumping between drop positions.
- **Recommendation for this app:** on phones, show one Bucket per screen with a Bucket switcher. Make **"Move to…" through a bottom sheet** the main way to move a todo between Buckets. Keep long-press drag for reordering within the visible Bucket, and optionally let a drag drop onto the Bucket switcher. See [Recommended patterns for the bucket board](#recommended-patterns-for-the-bucket-board).

## Current state of the board

These facts come from the repository at `origin/main` (b2b9bcc):

- The board is one horizontal scroll row of fixed `w-80` (320 px) Bucket columns, in the order Inbox, Year, Month, Week, Today. Each column scrolls vertically on its own (`src/features/board/components/board.tsx`, `bucket-column.tsx`). On a phone this means one column, plus a sliver of the next, with nothing to show where you are.
- Cards use `useDraggable` with a **handle** (`sortable-todo-card.tsx`). The handle is a `size='icon-xs'` button, **24×24 CSS px** (`todo-card.tsx`, `ui/button.tsx`). Drop targets are custom "todo-insertion" droppables that the provider resolves (`todo-drag-drop-provider.tsx`).
- `DragDropProvider` runs with **default sensors and plugins**: no custom `sensors`, `plugins`, or `announcements`. Board edge auto-scroll is done by hand in `lib/board-auto-scroll.ts`, with a 48 px edge threshold.
- The completion checkbox is `size-5` (20 px) and has `opacity-0 … group-hover:opacity-100` while incomplete (`todo-card.tsx`). **Touch devices have no hover, so on a phone the checkbox for an incomplete todo is invisible.**
- The edit dialog already has a **Bucket** `<select>` (`todo-dialog.tsx`). So a non-drag cross-Bucket move already exists, but it is hidden behind "open the todo, change a form field, save".

## 1. Board layouts on phones

| Pattern                                                            | How it works                                                                   | Examples                                                                                                                                                                                                                                                                                                                                                                       | Trade-offs                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paged columns** (horizontal swipe, one column per screen)        | Columns keep their desktop order. A horizontal swipe snaps to the next column. | Jira mobile: "Swipe across columns until you reach Add column" ([Jira Android: Manage your board](https://support.atlassian.com/jira-cloud-android/docs/manage-your-board/)). Todoist board layout: "Swipe through your existing sections to the far right" ([Todoist: Use the board layout](https://www.todoist.com/help/articles/use-the-board-layout-in-todoist-AiAVsyEI)). | Keeps the kanban mental model. The horizontal swipe competes with any horizontal gesture on cards, and with the browser's edge-swipe back gesture. Dragging a card across columns means holding it at the screen edge while the board scrolls. |
| **Single list with a column switcher** (tabs or segmented control) | Only one column is rendered, and a tab strip or menu picks which.              | Things on iPhone shows one list at a time, and moving between lists uses a Move dialog rather than dragging ([Things: Moving Items](https://culturedcode.com/things/support/articles/9651894/)).                                                                                                                                                                               | The clearest option on small screens, and it works without horizontal gestures. The board-wide "flow" between Buckets is less visible, so the switcher has to carry it (order, counts, labels).                                                |
| **Stacked or collapsible sections** (vertical)                     | All columns become sections on one vertical page.                              | A common responsive fallback. No first-party documentation from the apps above was found for it.                                                                                                                                                                                                                                                                               | Easy to scan, but long. Dragging between sections far apart on the page needs long auto-scrolls.                                                                                                                                               |

CSS scroll snap is the native way to build paged columns. `scroll-snap-type` goes on the scroller and `scroll-snap-align` on each column. `scroll-snap-stop: always` stops a fast fling from skipping columns ([MDN: CSS scroll snap](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap)). A tab strip that is kept in sync with the snapped column combines the first two patterns: swiping still works, and the tabs show where you are and let you jump.

## 2. Moving items between columns: drag compared with explicit actions

**What the platforms say**

- Apple HIG, Drag and drop: "Offer alternative ways to accomplish drag-and-drop actions. Sometimes, drag-and-drop operations are inconvenient or impossible for people to perform … you can include menu commands that people can use to copy an item and move it to another location." It also says: "Prefer letting people undo a drag-and-drop operation." ([Apple HIG: Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop))
- Apple HIG, Accessibility: "Offer alternatives to gestures … offer onscreen ways to achieve the same outcome." ([Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility))
- Atlassian (the team behind Trello and Jira), Pragmatic drag and drop design guidelines: "If the item already has a more actions (…) menu, put the move actions inside of the menu." Also: "If the entity does not have any more actions (…), make the drag handle icon into a menu button." ([Atlassian: design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines))
- WCAG 2.5.7's own examples include a task board where "a pop-up menu offers a click or tap path for moving the selected element to another column", and a kanban widget where one tap selects an item and an arrow button moves it ([Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)).

**What well-known apps do on phones**

| App                               | Drag on phone                                                                                                                                                                                                                                                                                                                     | Explicit move on phone                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Things (iPhone)                   | Touch and hold "until it pops up under your finger", then drag. Only reorders within a list ([Things: Using Gestures](https://culturedcode.com/things/support/articles/2803582/)). Dragging onto other lists is listed for Mac and iPad only ([Things: Moving Items](https://culturedcode.com/things/support/articles/9651894/)). | Swipe left to select, then **Move** in the bottom toolbar, then pick a destination. This is how lists are changed on iPhone.                                                                                  |
| Todoist (iOS/Android)             | Press and hold a task, then drag to reorder within a project ([Todoist: Introduction to tasks](https://www.todoist.com/help/articles/introduction-to-tasks-080OAXric)). The board layout allows dragging between sections ([board layout](https://www.todoist.com/help/articles/use-the-board-layout-in-todoist-AiAVsyEI)).       | iOS context menu: "Press and hold the task, then select **Move to…**". Or multi-select, then the Move to… icon.                                                                                               |
| Jira Cloud (Android/iOS)          | "Long-press an issue to drag-and-drop it elsewhere" ([Jira Android: Manage your board](https://support.atlassian.com/jira-cloud-android/docs/manage-your-board/)).                                                                                                                                                                | Open the issue and change its status from the dropdown under the summary ([Jira mobile tutorials](https://www.atlassian.com/software/jira/guides/mobile-apps/tutorials)).                                     |
| Trello                            | Drag on the web ([Trello: Move cards or lists](https://support.atlassian.com/trello/docs/moving-cards-or-lists/)). Mobile drag is reported in community threads only (not first-party).                                                                                                                                           | Card actions menu, then **Move** ([same article](https://support.atlassian.com/trello/docs/moving-cards-or-lists/)).                                                                                          |
| GitHub Projects (board, keyboard) | n/a                                                                                                                                                                                                                                                                                                                               | Enter or Shift+Space starts a move, arrows move between cells and columns, Enter commits, Esc cancels ([GitHub keyboard shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts)). |

Takeaway: these apps use long-press drag on phones for **nearby, visible** moves, mainly reordering. **Moving to a column or list that is off-screen** is done through an explicit destination picker. The Things iPhone app is the clearest case: it chose not to support dragging between lists at all.

**A note on touch and hold.** Apple lists "Touch and hold: Open a contextual menu" as the standard meaning of the gesture ([Apple HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)). Things, Todoist, and Jira use it to lift an item for dragging instead. Todoist's iOS menu shows both are possible, because iOS separates "hold" from "hold and move". On the web, one long press can't cleanly do both. The `PointerSensor` blocks `contextmenu` once a drag has started (see §5). Pick one meaning for long press (drag), and give the menu its own visible button.

## 3. Gesture conflicts with scrolling

- **Browser ownership.** When a touch begins, the browser decides from `touch-action` whether it will pan or zoom. Changes after the gesture has started have no effect. "An application using Pointer events will receive a `pointercancel` event when the browser starts handling a touch gesture." ([MDN: touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action), [MDN: pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event))
- **What dnd-kit does about it.** With a 250 ms delay and 5 px tolerance on touch, any movement before the delay ends aborts activation, and the browser scrolls as normal. After activation, the sensor captures the pointer and adds a non-passive `touchmove` listener that calls `preventDefault()` "to prevent scrolling on touch devices". It also blocks `click` and `contextmenu` for the rest of the drag. The dragged overlay gets `touch-action: none` (source: `@dnd-kit/dom@0.5.0` `PointerSensor.handleStart`, the `patchWindow` listener, and the `Feedback` style rules). So a dragged element doesn't need `touch-action: none` on its resting state, and the cards can stay scrollable.
- **Two scroll axes.** The board scrolls horizontally and each Bucket list scrolls vertically. A paged phone layout adds swiping between columns. Horizontal swipe gestures on cards (swipe to complete, swipe to move) would compete with paging. Apple: "Avoid conflicting with gestures that access system UI" ([Apple HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)). That covers the iOS Safari edge swipe for back and forward navigation, which sits right next to a horizontally paged board.
- **Auto-scroll during a drag.** Apple: "Scroll the contents of a destination when necessary", and stop when the drag leaves the container ([Apple HIG: Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop)). The app's own 48 px edge auto-scroll already does this. On a phone a 48 px edge zone is about 12 % of a 390 px screen, so holding a card there to scroll through several Buckets is slow and easy to trigger by accident.
- **Spring loading.** Apple describes "spring loading", where dragging over a button or segmented control activates it ([Apple HIG: Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop)). On phones this is the usual answer to "drag to a column that is off-screen": a Bucket tab strip that switches Buckets, or accepts the drop, while a card hovers over it.

## 4. Touch target sizes

| Source                                      | Requirement                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA | At least **24×24 CSS px**, or undersized targets spaced so that a 24 px circle centred on each does not touch another target or its circle ([Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html))                                                      |
| Apple HIG                                   | iOS default control size **44×44 pt**, minimum 28×28 pt ([Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)). "A button needs a hit region of at least 44x44 pt" ([Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)) |
| Android                                     | "At least **48dp x 48dp**. Larger is even better." ([Android: Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps))                                                                                                                                   |
| Atlassian drag and drop                     | When the handle is the only draggable part, its touch target should be at least 24×24 px ([design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines))                                                                                                 |

The current 24 px drag handle exactly meets WCAG AA but is well below the platform guidance. The 20 px checkbox sits 4 px (`gap-1`) from the handle, so it probably fails 2.5.8's spacing exception, and on touch it is invisible anyway (see Current state).

## 5. Accessibility alternatives to drag-and-drop

- **WCAG 2.5.7 Dragging Movements (AA):** "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging", unless dragging is essential. Keyboard dragging "does not automatically meet" 2.5.7 unless it also offers controls that can be clicked or tapped ([Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)). A keyboard sensor is required for 2.1.1, but it doesn't meet 2.5.7.
- **Announcements:** messages "should contain the name of the item being moved, as well as its old and new position". After a menu move, focus "should move to the original trigger element whenever possible", and in React the moved item may remount, so this needs to be handled on purpose. The moved item should "flash" once to confirm where it landed. ([Atlassian: accessibility guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines), [design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines))
- **Arrow-key dragging has limits:** "Directional arrow movement doesn't always make sense when you can't see the interface you are engaging with" ([Atlassian: accessibility guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines)). Their recommendation is menu actions rather than relying on keyboard dragging.
- **Platform assistive tech:** iOS assistive features (Voice Control, Switch Control, AssistiveTouch, Full Keyboard Access) work far better with visible buttons than with custom web gestures ([Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).

## 6. What `@dnd-kit/react` 0.5 supports

All of this was verified in the installed `@dnd-kit/dom@0.5.0` source and the [Sensors guide](https://dndkit.com/react/guides/sensors).

**Sensors.** `defaultPreset.sensors = [PointerSensor, KeyboardSensor]`. Sensors can be set on `DragDropProvider` (`sensors`), per draggable (a `sensors` option on `useDraggable` or `useSortable`), and per instance with `Sensor.configure({...})`. Passing an array replaces the defaults, so leaving out `KeyboardSensor` removes keyboard support. Passing a function lets you extend the defaults.

**PointerSensor defaults** (covers mouse, touch, and pen through Pointer Events):

| Input                                 | Default activation                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Mouse on the handle                   | Immediate: no constraints                                                                     |
| Touch                                 | `Delay({ value: 250, tolerance: 5 })`                                                         |
| Pointer on a text input               | `Delay({ value: 200, tolerance: 0 })`                                                         |
| Anything else (mouse off-handle, pen) | `Delay({ value: 200, tolerance: 10 })` **or** `Distance({ value: 5 })`, whichever comes first |

- The sensor only handles primary-button, `isPrimary` pointers, and only while no other drag is running.
- `preventActivation` stops drags that start on interactive elements other than the element or handle.
- During a drag it calls `setPointerCapture`, blocks `touchmove` (so the page does not scroll), and blocks `click` and `contextmenu`. Escape cancels the drag.
- `activatorElements` can point activation at a different element.

**KeyboardSensor defaults.**

- Keys: start on `Space` or `Enter`; drop on `Space`, `Enter`, or `Tab`; cancel on `Escape`; arrows move.
- Each arrow press moves `offset: 10` px, or ×5 with Shift.
- It only activates when the handle (or the element, if there is no handle) has focus.
- It **turns off `AutoScroller`** during a keyboard drag.
- With **`useSortable`**, the `SortableKeyboardPlugin` changes arrow presses so they jump to the next sortable drop target in that direction (closest corners). With plain **`useDraggable`**, which is what this app uses, an arrow press moves the item 10 px. Crossing a 320 px column then takes about 30 presses, or about 6 with Shift. The thin insertion-line droppables also make the result hard to predict. A custom keyboard path is likely needed: switch to `useSortable` for the cards, or handle the keyboard yourself.

**Accessibility plugin** (on by default):

- It adds a hidden instructions element and a `role="status"`, `aria-live="polite"` live region.
- On each activator it sets `tabindex="0"` where needed, `role="button"` (unless the activator is already a `<button>`), `aria-roledescription="draggable"`, `aria-describedby`, `aria-pressed` or `aria-grabbed`, and `aria-disabled`.
- Default instructions: "To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item in a given direction. Press space again to drop the item…"
- Default announcements use ids, for example "Picked up draggable item todo-12." and "Draggable item todo-12 was dropped over droppable target …".
- It can be configured with `Accessibility.configure({ announcements, screenReaderInstructions, debounce })`. `dragover` and `dragmove` announcements are debounced by 500 ms by default.
- Today the app gets the id-based defaults, which say nothing useful to a screen-reader user.

**Other default plugins:** `AutoScroller` (configurable `threshold` and `acceleration`), `Cursor`, `Feedback` (overlay and drop animation), and `PreventSelection`. No configuration is needed for touch beyond the sensor defaults.

## 7. Bottom sheets

On phones, a bottom sheet is the usual home for a "Move to…" picker or an item's actions: Things' Move dialog and Todoist's Move to… picker both work this way. shadcn's **Drawer** is now built on Base UI ("The drawer component now uses Base UI instead of Vaul"). Its docs show a responsive pattern that combines `Dialog` and `Drawer`: a dialog on desktop and a drawer on mobile ([shadcn Drawer](https://ui.shadcn.com/docs/components/drawer)). This project already depends on `@base-ui/react` and uses the `base-vega` style, so adding it should only need `shadcn add drawer` and no new library. Confirm this when the component is added. A dropdown or context menu component (`shadcn add dropdown-menu`) is also not installed yet.

## Recommended patterns for the bucket board

These recommendations combine the sources above with this app's domain. Todos flow from broader Buckets to narrower ones: Inbox → Year → Month → Week → Today.

1. **Phone layout (below `md`): one Bucket per screen, with a sticky Bucket switcher.**
   - Render the columns as a horizontal scroll-snap pager (`scroll-snap-type: x mandatory`, `scroll-snap-stop: always`).
   - Sync it with a sticky tab strip or segmented control: Inbox · Year · Month · Week · Today, each with its count. The tab strip keeps the flow order visible, and it gives switch, keyboard, and screen-reader users a non-swipe way to change Bucket.
   - Open on **Today** by default on phones. This is a product call: it is the most actionable Bucket.
   - Keep the multi-column board from `md`/`lg` upwards.
2. **Main cross-Bucket move: "Move to…" in a bottom sheet.**
   - Each card gets one visible ≥44 px "more" button (Atlassian: the handle can double as the menu button).
   - The button opens a Drawer (Dialog on desktop) with a **Move to** list of Buckets in flow order. Mark the current Bucket, and put the next narrower Bucket first as a one-tap shortcut, for example "Move to This Week".
   - Put Edit, Complete, and Delete in the same sheet.
   - This meets WCAG 2.5.7 and HIG "offer alternatives". It matches Things, Todoist, Trello, and Jira, and it reuses the existing move mutation.
   - Insert the moved todo at the **top** or **bottom** of the target Bucket (one rule, chosen by product).
   - After the move, show an Undo toast (HIG: "Prefer letting people undo"), keep focus on a sensible element, and flash the card if it stayed in view.
3. **Within-Bucket reordering: long-press drag, plus menu fallbacks.**
   - Keep dnd-kit's touch default (250 ms / 5 px) so scrolling stays natural. Consider making the **whole card** the activator on touch, with tap still opening the editor. dnd-kit already blocks `click` once a drag has started.
   - Add **Move up / Move down / Move to top** items to the sheet as the non-drag reorder path.
   - Don't give long press a second meaning, such as opening a context menu.
4. **Optional: cross-Bucket drag on phones through spring-loaded tabs.** While a card is being dragged, the Bucket tabs become drop targets. Hovering briefly switches the visible Bucket, and dropping on a tab moves the card to that Bucket's top or bottom. This avoids slow edge auto-scrolling across five pages. Treat it as an enhancement; the menu path is enough.
5. **Avoid horizontal swipe actions on cards in the paged phone layout.** They conflict with column paging and with the browser's edge-swipe navigation. If swipe-to-complete is ever added, it needs an on-screen button equivalent (HIG) and should not be horizontal while columns page horizontally.
6. **Touch targets: aim for 44 px on coarse pointers, never below 24 px.**
   - Use `pointer: coarse` or `md`-down variants to grow the handle and menu button and to separate them.
   - **Always show the completion checkbox on touch.** Today's hover-only reveal hides it. Make it at least 24 px with spacing, and ideally 44 px.
7. **Keyboard and screen readers.**
   - Replace the default announcements with ones that use the todo title and Bucket labels, for example "Picked up 'Buy milk' in This Week.", "Over Today, position 2 of 5.", and "Moved 'Buy milk' to Today, position 2 of 5."
   - Give the instructions the same treatment.
   - Fix keyboard dragging so arrows jump between insertion points and Buckets: use `useSortable`, or a custom keyboard handler or `KeyboardSensor` options.
   - In any case, the "Move to…" menu is the main keyboard and assistive-tech path.
8. **Desktop stays as it is,** plus the same "more" menu on every card, so all viewports share one mental model.

## Open items and limits of this research

- Material Design 3 pages (gestures, touch targets, bottom sheets) are rendered client-side and could not be read. Android's 48dp guidance is cited from developer.android.com instead.
- No first-party documentation was found for Linear's mobile board interactions, or for Trello's mobile drag gesture. These are deliberately left out of the evidence.
- `@dnd-kit/react` is pre-1.0 (0.5.0), so its defaults may change. The values above come from the installed source, not just the docs. The Sensors guide says `keyboardCodes` uses `KeyboardEvent.key`, but the 0.5.0 source matches on `event.code`.
- The touch behaviour described in §3 and §6 was read from the source and has not been tested on real iOS or Android devices. Check it on a device during prototyping: long press on a scrolling card, the iOS text-selection callout, and the edge-swipe back gesture.
