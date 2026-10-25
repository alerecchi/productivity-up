# Voice

How Productivity Up speaks: the voice and tone rules, the user-facing vocabulary, and how dates and periods are named. It applies to every string a user can see or hear, including `aria-label`s, toasts, emails and server messages that reach the UI.

`GLOSSARY.md` is the domain and code language. This file maps it to plain words for a broad audience. The two differ on purpose: copy says "Unfinished todos" where code says Bucket Migration. Personality and audience come from `docs/PRODUCT.md`.

The rules are principles and the examples show them applied to today's features. When a new feature needs a rule this file doesn't have, add the rule here instead of deciding it in a single component.

## Tone

- **Upbeat and brief.** Each string says one thing and points to the next step. Cut filler such as "please", "successfully" and "effectively".
- **A helpful companion.** Nudge at key moments, then get out of the way. Offer an action instead of an instruction or a lecture.
- **Neutral about unfinished work.** Unfinished work is a choice the user makes, never a failure. Use no "overdue", no "missed" and no "you didn't…".
- **Lightly playful, rarely.** Playfulness appears only in celebration lines (see [Celebrations and nudges](#celebrations-and-nudges)). Errors, forms, auth and legal copy stay plain.
- **Talk to "you".** The app has no "we": errors name the thing, not who acted ("Your todo wasn't saved."). "We" appears only where a person or service really acts, as in emails ("We received a request to reset your password.").

## Mechanics

- **Sentence case everywhere**: headings, buttons, labels, tabs, menu items and dialog titles ("Create account", "Email address", "No category"). Capitalise only proper nouns and bucket names used as names (see [Dates and periods](#dates-and-periods)).
- Glossary terms are ordinary words in copy and never get Title Case mid-sentence.
- The product name is **Productivity Up**, two words.
- **Full sentences end with a full stop**, including inline errors. Labels, buttons, headings and fragments ("3 done · 2 unfinished") have none.
- **Ellipsis "…"** (the single character) marks work in progress only: "Saving…", "Getting today ready…".
- **Exclamation marks** belong to celebration lines only, one per screen at most.
- No emoji.
- **Contractions** are welcome ("can't", "you're", "Today's finished.").
- **Numerals** for counts ("3 todos"). **En dash** for ranges ("19–25 October"). **Middle dot** to join short facts ("3 done · 2 unfinished").
- **Placeholders** use no personal names. The email placeholder is always "name@example.com". Example todos mix work and home ("Book the dentist", "Send the Q3 report").

## Errors

Every error says **what happened and what to do next**, in one or two short sentences:

- Put the fix in a button where one exists ("Try again"), not in prose.
- Field errors state the fix: "Enter an email address like name@example.com."
- Use no blame, no "refresh the page", and no developer words (token, request, conflict, unauthorized, validation, server).
- Server and `Error` messages never reach the UI as raw text. The client maps known error codes to copy and falls back to "Something went wrong. Try again."
- Recoverable states that aren't really errors (an expired reset link) say what to do: "This link has expired. Send a new one."

## Feedback

Feedback is needed only when the user can't see the result where they're looking. A toast is right when one of these is true:

1. **The result happened off-screen**: a todo added or moved to a bucket the user isn't viewing ("Moved to this week").
2. **The action is destructive** and could be undone ("Todo deleted", plus "Undo" if undo exists).
3. **Something failed in the background** where no form can show the error: a drag, a checkbox, a move. The toast says what happened and offers "Try again".

Anything else gets silence, because the visible change is the feedback. Form outcomes stay inline in the form. An outcome that crosses a page change gets a persistent inline note on the destination page instead of a toast ("Password changed. Sign in with your new one."). Confirmations are short, in the past tense, and carry their action.

## Celebrations and nudges

Celebrations scale with the achievement and reward finishing work (`PRODUCT.md`). The moments:

| Moment                                              | Size                       | Copy                                                                                                                                                            |
| --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A todo is done                                      | Smallest                   | No words; a quick check animation                                                                                                                               |
| Today cleared (the last open todo in Today is done) | Biggest daily moment       | "All done for today!" + "Finish today when you're ready."                                                                                                       |
| Daily recap (after the day finishes)                | One size for every period  | See [The end of a day](#the-end-of-a-day)                                                                                                                       |
| Today empty                                         | A nudge, not a celebration | "Nothing planned for today." + one action pointing to the nearest broader bucket that has todos ("Pull from this week"), or "Add a todo" if everything is empty |

- Celebration lines rotate through a small pool of 3–4 variants each so they don't go stale ("All done for today!" / "Today's clear!" / "That's everything for today!"). Every other string is fixed.
- When nothing was done, nothing is celebrated: the copy gives one calm line and no "0 done".
- A celebration counts only the period that just ended. Nothing compares periods ("best week yet"), keeps a running total, or can "break". That would be gamification.
- A new feature gets a celebration only if it marks finished work, and its size sits on this scale.

## Dates and periods

### Naming a bucket

Each time-based bucket has a **relative name** ("Today", "This week", "This month", "This year") and a **date**. Which one to show depends on what the user is doing:

| User is…                                                                                | Show                                         | Examples                                                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Choosing or orienting** (column headings, the "When" picker, a "Move to…" sheet)      | Relative name with the date as a second line | Today _Sunday 25 October_; This week _19–25 October_; This month _October_; This year _2026_ |
| **Acting** (buttons, toasts, running text, tight spaces like the phone bucket switcher) | Relative name only, lower case mid-sentence  | "Move to this week", "Added to this month"                                                   |
| **Looking back** (recaps, anything about a period that has ended)                       | Date only                                    | "Sunday 25 October", "19–25 October"                                                         |

**Someday** has no period and is always just "Someday".

### Relative to the real today

Relative names are always computed against the user's real today, never against the bucket being shown or reviewed. A relative name that's more than one step away from today becomes a date.

- After the user finishes today early, the daily bucket reads **"Tomorrow"**. If tomorrow starts a new week, month or year, those buckets read **"Next week"**, **"Next month"**, **"Next year"**.
- A period that ended one step back is "yesterday" / "last week". Further back, use the date ("Thursday 22 October").

### Formats

- The copy is English. Format dates with `Intl` in the user's locale: "Sunday 25 October" in en-GB, "Sunday, October 25" in en-US.
- Spell out month names, or use the locale's short form where space is tight. Use no numeric dates and no ISO keys like "2026-W43".
- No week numbers. A week is its date range.
- Show the year only when it isn't the current year.
- Weeks start on Monday.

## Vocabulary

### One name per concept

| Concept                 | Say                                         | Never                                    |
| ----------------------- | ------------------------------------------- | ---------------------------------------- |
| Signing in              | Sign in                                     | Login, Log in                            |
| Signing out             | Sign out                                    | Logout, Log out                          |
| Making an account       | Create account                              | Signup, Sign up, Register                |
| An item of work         | todo, todos                                 | task, to-do, TODO                        |
| Finishing work (verb)   | finish ("Finish today", "5 todos finished") | complete, wrap                           |
| Its state               | done / unfinished                           | completed, complete, incomplete, wrapped |
| A todo with no category | No category                                 | No Category, None                        |
| A period's end          | ends ("Sunday has ended.")                  | expires, closes, reaches its end         |

### Domain terms in copy

| Domain term (`GLOSSARY.md`)      | In copy                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bucket                           | "bucket", used sparingly. Name the specific bucket wherever possible ("This week"). A field that picks a bucket is labelled **"When"**.                |
| Inbox                            | **Someday**. It completes the time ladder (Someday, This year, This month, This week, Today) and reads naturally as a destination ("Move to someday"). |
| Bucket Migration, Migration Flow | **Unfinished todos**. Entry button: "Review unfinished todos". Nothing to review: "Nothing left to sort".                                              |
| Carry forward / move back        | The **destination's name**: "Tomorrow", "This week", "Someday"; bulk: "Move all to this week"                                                          |
| Day Recap                        | Its copy is in [The end of a day](#the-end-of-a-day)                                                                                                   |
| Planning Date ahead of today     | "Today's finished. You're planning tomorrow."                                                                                                          |
| Lifecycle Reconciliation         | Loading copy only: "Getting today ready…"; first visit "Setting up your board…"                                                                        |

Any glossary term that is neither in this table nor in the mechanism list below is used as it is, following [Mechanics](#mechanics) for casing: todo, category, tag, "Finish today", and a period that ends ("Sunday has ended.").

These are mechanisms, not experiences, so they never appear in copy: _Pending Migration Bucket, Migration Step, Bucket Horizon, horizon, Period Key, Planning Date, Future Bucket, Skipped Period, Lifecycle Reconciliation, lifecycle, archived_. Copy describes what the user sees ("Done todos leave the board when the day ends.").

### Naming a new concept

1. Name what the user experiences, not the mechanism behind it.
2. Prefer an everyday word that a person who has never heard of GTD would use unprompted.
3. Name actions by their result or destination ("Move to this week", not "Move back").
4. Pick one name. If the plain word is also accurate in the domain, rename the domain term in `GLOSSARY.md` so no translation is needed, as with Finish Today. Otherwise add the mapping to the tables above.

## The end of a day

The day ends in one of two ways, and the copy must read correctly in both:

- **Finished early.** The user pressed Finish today, so the day isn't over yet: they're sorting _today's_ unfinished todos for _tomorrow_.
- **The period ended.** The user opens the app after midnight, or after days away: they're sorting _yesterday's_ (or an older day's) todos for the _new today_.

Applying [Relative to the real today](#relative-to-the-real-today) covers both without special cases:

- **The review heading** names the source: "Today's unfinished todos" (finished early), "Yesterday's unfinished todos", "Last week's unfinished todos", "Unfinished todos from Thursday 22 October".
- **The review intro**: "Sunday has ended. Choose where each unfinished todo goes."
- **The destination buttons**, when you finish early mid-week: Tomorrow / This week; finishing early on a Sunday: Tomorrow / Next week; the morning after: Today / This week.
- **The recap headline** (one size for every period):
  - Something done: "Nice work! 5 todos done today." (or "…yesterday.", "…on Thursday 22 October.")
  - Nothing done: "Today's finished."
  - Empty day: "Today's finished. Tomorrow's ready when you are."
- **The recap button**: "Review unfinished todos" when there's anything to sort; otherwise "Plan tomorrow" (finished early) or "Go to today" (period ended).
- **The recap body** reports, never instructs. Describing the machinery ("Capture the close of each bucket…") is out. Its layout belongs to the recap prototype.
- **While planning tomorrow**, the Finish today button is hidden, not disabled. The board header shows the planning line from the table above.
