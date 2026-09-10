# Productivity Up

Productivity Up is a todo management context organized around moving work from broader time horizons into narrower ones.

## Language

**Bucket**:
A time-based container that holds todos for a planning horizon, such as this year, this month, this week, or today. Todos are expected to flow from broader buckets toward narrower buckets as they become more immediate.
_Avoid_: Column, lane.

**Bucket Horizon**:
The calendar granularity a time-based bucket represents: yearly, monthly, weekly, or daily. A bucket's horizon determines which current period it belongs to in the user's timezone.
_Avoid_: Bucket size, bucket level.

**Broader Bucket**:
The nearest active bucket with a broader enabled horizon than another bucket, or the inbox when no broader time-based horizon exists. Bucket migrations can move todos back to this bucket.
_Avoid_: Parent bucket, previous level.

**Most Granular Bucket**:
The active bucket with the narrowest enabled horizon for a user. In the current product this is the daily bucket, but future settings may make weekly or monthly the most granular bucket.
_Avoid_: Last bucket, leaf bucket.

**Current Period**:
The calendar span represented by a bucket horizon for a specific user at a specific moment, calculated in that user's timezone.
_Avoid_: UTC period, server date.

**Skipped Period**:
A calendar period that passed while the user had no active bucket for that horizon. Skipped periods do not get buckets created retroactively.
_Avoid_: Missing bucket, backfilled period.

**Period Key**:
A stable text identifier for a bucket's period, such as `2026`, `2026-07`, `2026-W01`, or `2026-07-14`. Period keys identify buckets; user-facing bucket labels are derived from them.
_Avoid_: Bucket label, display name.

**Planning Date**:
The local date the board is currently organized around for a user. It is normally today in the user's timezone, but may be tomorrow after the user completes the day early.
_Avoid_: Display date, selected date.

**Future Bucket**:
A bucket that belongs to the user's Planning Date while that Planning Date is still ahead of today in the user's timezone. Future buckets are visible planning-ahead state and cannot be manually completed.
_Avoid_: Tomorrow bucket, upcoming bucket.

**Bucket Expiration**:
The moment when a time-based bucket's period has ended in the user's timezone. An expired bucket no longer represents the current period for its horizon.
_Avoid_: Due date, deadline.

**Lifecycle Reconciliation**:
The process that aligns a user's active buckets with their Planning Date. It creates needed current buckets, archives buckets that need no attention, and starts a migration flow when incomplete todos require user choices.
_Avoid_: Sync, refresh.

**Bucket Migration**:
The review of incomplete todos from an expired or completed bucket, where each todo is either carried into the next period for that bucket horizon or moved back to the broader bucket.
_Avoid_: Rollover, cleanup.

**Pending Migration Bucket**:
A bucket that no longer belongs on the active board but still contains incomplete todos that require user migration choices before it can be archived.
_Avoid_: Active expired bucket, blocked bucket.

**Migration Flow**:
A sequence of one or more bucket migrations presented to the user when multiple buckets need attention. Each step migrates one bucket before moving to the next bucket.
_Avoid_: Batch migration, bulk rollover.

**Migration Step**:
One bucket migration inside a migration flow. A migration step becomes durable only when the user confirms its choices.
_Avoid_: Draft migration, partial migration.

**Planning Flow**:
An optional, finite guided experience for pulling incomplete Todos from broader Buckets into newly created Buckets after Lifecycle Reconciliation and any required Migration Flow have finished. Except during initial board creation, a new Bucket is eligible whenever at least one broader Bucket contains an incomplete Todo, regardless of which lifecycle action created it. Eligible Buckets are planned independently from broader to narrower horizons. Users may also create, inspect, edit, and complete Todos while planning. A Planning Flow can be entered only once; leaving it consumes the opportunity, while dismissing the initial invitation leaves a quieter Bucket callout until the Bucket is self-planned or the flow begins.
_Avoid_: Planning mode, mandatory planning.

**Completion Recap**:
A summary shown before a migration flow begins, or after the user manually completes the most granular bucket with nothing left to migrate. It gives feedback on completed and incomplete todos in the buckets that need attention.
_Avoid_: Report, retrospective.

**Todo**:
An item of work that a user wants to remember, plan, or complete within a bucket. User-facing text may call this a task when that reads more naturally.
_Avoid_: Task in domain and code language.

**Todo Position**:
The placement of a todo relative to other todos in the same bucket. A todo's position is part of the board's durable planning state, so moving a todo within or between buckets changes where it belongs in that ordered bucket.
_Avoid_: Ephemeral UI order, sort order.

**User**:
A person who uses the app. A User may have an authenticated session before verifying their email, but may only check or resend verification, sign out, and recover the account until verification succeeds.
_Avoid_: Account when referring to the person.

**User Timezone**:
The timezone used to decide which periods are current for a user's buckets. Bucket lifecycle rules use the user's stored timezone, not the server timezone.
_Avoid_: Browser timezone, server timezone.

**Category**:
A reusable user-owned macro area that can be assigned to todos, such as work, private life, or home admin. A todo can have at most one category.
_Avoid_: Label, tag.

**Tag**:
A reusable user-owned marker that can be associated with one or more todos. Tags are compact handles; a todo can have zero or more tags.
_Avoid_: Label, category.
