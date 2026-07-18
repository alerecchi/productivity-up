# TanStack authentication state, form mutation, and cache patterns

Research date: 2026-07-17  
Repository snapshot: [`9a8cb43`](https://github.com/alerecchi/productivity-up/tree/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b)  
Relevant installed versions: TanStack Start `^1.168.27`, Router `^1.170.17`, Query `^5.101.2`, Form `^1.33.1`, and Router SSR Query `^1.167.1`.

## Question and boundary

What do the current TanStack Start, Router, Query, and Form contracts imply for session loading, protected routes, hydration, auth mutations, redirects, and server errors in this repository?

This note identifies constraints, current behavior, risks, and viable design choices. It deliberately does **not** select the final auth architecture or implement it. Better Auth's provider-specific behavior is outside this note except where its return shape affects TanStack semantics.

## Executive findings

1. The repository has the right security split: route guards improve navigation UX, while user-data server functions independently authorize through `authRequiredMiddleware`. TanStack explicitly says that `beforeLoad` is not an authorization boundary. This invariant must survive any refactor. ([Start authentication](https://tanstack.com/start/latest/docs/framework/react/guide/authentication#core-concepts), [Router authenticated routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes#the-routebeforeload-option))
2. The Query SSR plumbing is structurally sound. `getRouter()` constructs a fresh `QueryClient`, passes it through router context, and calls `setupRouterSsrQueryIntegration`; the official integration requires a fresh client per SSR request and automates dehydration/hydration and streaming. ([Router–Query integration](https://tanstack.com/router/latest/docs/integrations/query#setup), [integration source](https://github.com/TanStack/router/blob/main/packages/router-ssr-query-core/src/index.ts))
3. The session is currently a 15-minute Query snapshot created by root `beforeLoad`. `fetchQuery` returns fresh cached data without contacting the server, so Router can continue to expose a stale user or stale anonymous result until explicit invalidation or expiry. That is a UX/state-consistency limit, not a server authorization bypass, because protected server functions re-check the request. ([QueryClient `fetchQuery`](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientfetchquery))
4. `_authenticated` is only a directory naming convention today, not a pathless parent route. `board` and `migration` each repeat the guard. Router runs a parent's `beforeLoad` before all children and stops child loading after a thrown redirect, so an actual parent route is a supported way to centralize the policy; keeping leaf guards is also possible but makes policy drift easier. ([Router authenticated routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes#the-routebeforeload-option))
5. A Query `mutationKey` does **not** connect a mutation to a query or invalidate it. Its documented function is to inherit mutation defaults. Login/signup/logout must therefore update or invalidate session state explicitly. ([`useMutation`](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation))
6. Login's unfiltered `queryClient.resetQueries()` is both broader and less intentional than its comment assumes. It runs in Query's `onSuccess` even when Better Auth resolves to `{ error }`, because Query success is based on promise resolution, not an application-level error field. `resetQueries` resets all matching queries and refetches active ones; with no filter, it affects the whole client cache. ([`useMutation`](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation), [`resetQueries`](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientresetqueries))
7. Logout refreshes the session correctly by invalidating `['auth', 'session']` and then invalidating Router, but it leaves user-owned board/category/tag/todo data in the browser cache. The final design needs an explicit identity-boundary policy: namespace user data by identity, remove protected queries on logout/account switch, clear the client cache, or combine these approaches. TanStack supplies distinct `invalidateQueries`, `removeQueries`, `resetQueries`, and `clear` operations; they are not interchangeable. ([QueryClient methods](https://tanstack.com/query/latest/docs/reference/QueryClient))
8. The forms' use of `onSubmitAsync` to call the server and return `{ form, fields }` is an officially documented TanStack Form pattern, not a workaround. The problems are consistency and failure classification: transport exceptions, Better Auth's resolved error values, navigation, field errors, and global errors are handled differently across flows. ([Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation#setting-field-level-errors-from-the-forms-validators))

## Current request, route, and cache topology

### Initial request and hydration

[`src/router.tsx`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/router.tsx) creates one `QueryClient` inside `getRouter()`, supplies it as router context, sets `defaultPreloadStaleTime: 0`, and installs `setupRouterSsrQueryIntegration`.

These choices align with official contracts:

- A fresh QueryClient per SSR request prevents one user's cache from being shared with another request. ([Router–Query integration](https://tanstack.com/router/latest/docs/integrations/query#setup), [Query SSR](https://tanstack.com/query/latest/docs/framework/react/guides/ssr#initial-setup))
- `defaultPreloadStaleTime: 0` hands loader freshness and deduplication to the external Query cache instead of Router's preload cache. ([Router data loading](https://tanstack.com/router/latest/docs/guide/data-loading#passing-all-loader-events-to-an-external-cache))
- The SSR Query integration wraps the app in `QueryClientProvider`, dehydrates server queries, hydrates them in the browser, and streams newly discovered queries. The installed integration's source also cancels queries and clears the server QueryClient during SSR cleanup. ([Router–Query integration](https://tanstack.com/router/latest/docs/integrations/query), [integration source](https://github.com/TanStack/router/blob/main/packages/router-ssr-query-core/src/index.ts))

[`src/routes/__root.tsx`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/routes/__root.tsx) then calls `fetchQuery(userSessionQuery.options())` in root `beforeLoad` and returns `session` and `user` into route context. [`user-session.ts`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/features/authentication/queries/user-session.ts) gives this query a 15-minute `staleTime`.

On an SSR request, this means the cookie-derived Better Auth session is fetched server-side and dehydrated into the browser Query cache. Query recommends a nonzero SSR `staleTime` to avoid immediately refetching hydrated data, so avoiding an immediate duplicate fetch is sound. The unresolved product choice is freshness: 15 minutes is also the interval during which `fetchQuery` may reuse a cached session without checking the cookie-backed source of truth. ([Query SSR](https://tanstack.com/query/latest/docs/framework/react/guides/ssr), [`fetchQuery`](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientfetchquery))

### Selective SSR

Both protected leaves set `ssr: false`. Under Start's selective-SSR contract, `ssr: false` means that route's own `beforeLoad`, loader, and component do not run on the server. A parent's less restrictive work can still run: root `beforeLoad` obtains the session, but each leaf's auth redirect and board loader wait for the browser. By contrast, `ssr: 'data-only'` runs `beforeLoad` and loader on the server without rendering the route component, while default `ssr: true` runs all three. ([Start selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr))

That produces three viable evaluation branches rather than an automatic recommendation:

| Route mode | Auth redirect | Data load | Component render | Main tradeoff |
| --- | --- | --- | --- | --- |
| `false` (current leaves) | Browser | Browser | Browser | Simple client-only board, but slower initial auth decision and data waterfall |
| `'data-only'` | Server | Server | Browser | Early redirect/data without server-rendering the interactive board |
| `true` | Server | Server | Server | Strongest first paint; requires SSR-safe board code and careful browser-only dependencies |

The auth plan should choose this based on board rendering constraints, not treat authentication as the reason to disable SSR. The root already demonstrates that cookie/session checks can run on the server.

## Route protection and session ownership

### Two layers with different jobs

TanStack's current guidance is unambiguous: `beforeLoad` is a UI/navigation gate, while every server function, server route, or API endpoint returning private data must authorize itself. A route URL can be bypassed and a server function called directly. ([Start authentication](https://tanstack.com/start/latest/docs/framework/react/guide/authentication#core-concepts))

The repository follows that security requirement for board, todo, category, and tag functions through [`authRequiredMiddleware`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/server/middlewares/auth-middleware.ts). Route consolidation must not replace these checks.

The UI layer is less consolidated. The generated route tree shows no `_authenticated` parent route; [`board.tsx`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/routes/_authenticated/board.tsx) and [`migration.tsx`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/routes/_authenticated/migration.tsx) are direct root children and repeat `redirectIfNotAuthenticated`.

Router makes a pathless authenticated layout a natural candidate because a parent's `beforeLoad` runs before child `beforeLoad`/loaders and a thrown redirect prevents children from loading. The target design can choose between:

- one `_authenticated/route.tsx` policy that returns a narrowed authenticated user/session to all children;
- leaf-level guards, preferably through one shared helper and tests; or
- a parent baseline plus leaf authorization for genuinely different policies.

The first reduces duplication; the latter two preserve local visibility. None changes the need for server middleware. ([Router authenticated routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes#the-routebeforeload-option))

### Query owns fetched session data; Router owns a derived snapshot

There are currently two representations of the same fact:

1. Query owns the cached Better Auth response at `['auth', 'session']`.
2. Root route context owns `session` and `user` values copied from that query during `beforeLoad`.

Updating the Query cache does not by itself recompute already-matched route context. Router documents `router.invalidate()` as the operation that reruns matched `beforeLoad` and load functions; it can also recompute router context. Therefore an in-document auth transition generally has two synchronization concerns: update/fetch the canonical session query, and rerun Router so guards and consumers see the new snapshot. ([Router `.invalidate`](https://tanstack.com/router/latest/docs/api/router/RouterType#invalidate-method), [Router context invalidation](https://tanstack.com/router/latest/docs/guide/router-context#invalidating-the-router-context))

The target design should state which layer is authoritative for rendering:

- **Route-derived session:** components consume route context; every auth transition synchronizes Query first and invalidates Router second.
- **Observed Query session:** components use a `useQuery` observer and route guards fetch the same query options; Router still needs invalidation when guards depend on the result, but window-focus/reconnect behavior becomes available to the mounted observer.
- **Better Auth-owned reactive session plus route bridge:** Better Auth's client state is primary and is injected into Router context; this requires careful SSR and Query duplication analysis.

The current code is closest to route-derived session but has no shared transition primitive, so each flow implements a different subset.

### Freshness and external changes

Because the session query is fetched imperatively in `beforeLoad` rather than observed with `useQuery`, Query's observer-driven window-focus refetch does not keep it current. A session revoked in another tab/device, a cookie changed by an auth callback, or an expired session may remain represented by the cached root context until one of these happens:

- the 15-minute `staleTime` expires and a route load calls `fetchQuery`;
- code explicitly invalidates/refetches the session and invalidates Router;
- a full document navigation creates a fresh SSR request; or
- the target architecture adds an observer or cross-tab/session event bridge.

This staleness affects navigation and chrome. It must never be relied on for permission because server middleware is the live authority.

## Auth mutations and cache transitions

### Mutation keys are metadata/default selectors

Login, signup, and logout all set `mutationKey: userSessionQuery.key`. TanStack documents `mutationKey` as a way to inherit defaults registered with `queryClient.setMutationDefaults`; it does not associate the mutation with a query having the same array key. Invalidations happen through explicit callbacks such as `onSuccess` plus `invalidateQueries`. ([`useMutation`](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation), [invalidations from mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations))

Consequently, comments suggesting that a mutation key "says to the cache" that the session changed are incorrect. Keeping the key can still be useful for mutation defaults, `useMutationState`, debugging, or grouping, but it cannot replace a cache transition.

### Resolved auth errors are Query successes

[`login-form.tsx`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/features/authentication/components/login-form.tsx) returns `authClient.signIn.email(...)` from `mutationFn`. Better Auth's client result is then inspected for `result.error` by the form validator. From Query's perspective, any resolved promise reaches `onSuccess`; only a rejected promise reaches `onError`. Therefore the current unfiltered `resetQueries()` runs for invalid credentials and unverified-email results as well as for a successful login. This is a direct consequence of `useMutation`'s promise contract. ([`useMutation`](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation))

The design space is:

- make the mutation function throw a typed/domain error when the auth client resolves an error, then map that error for Form;
- keep the resolved-result contract but place session/cache work only after `result.error` has been ruled out; or
- omit Query for a form-local auth request and let TanStack Form own pending/error state, while a shared auth-transition function handles cache and Router synchronization after success.

Query adds value when mutation state, retry policy, shared defaults, global observation, serialization, or cross-component coordination is wanted. TanStack Form already owns `isSubmitting` and officially supports async server validation, so wrapping every auth call in Query is not required by either library. This is an architecture choice, not a blanket rule.

### Distinguish cache operations by intent

TanStack's methods have different contracts: ([QueryClient](https://tanstack.com/query/latest/docs/reference/QueryClient))

| Operation | Effect relevant to auth |
| --- | --- |
| `setQueryData(sessionKey, value)` | Synchronously installs a known session response; no network validation |
| `invalidateQueries({ queryKey: sessionKey })` | Marks matching session data invalid and refetches active observers by default |
| `fetchQuery(sessionOptions)` | Returns a fresh cached value or fetches/throws; useful when the transition must await the canonical server result |
| `resetQueries(filters?)` | Resets matching queries to initial/preloaded state; active matches refetch |
| `removeQueries(filters)` | Removes matching entries without refetching |
| `clear()` | Clears all connected Query and mutation caches |
| `router.invalidate()` | Reruns route `beforeLoad` and loaders; does not itself define Query's protected-data retention policy |

This leads to separate decisions for each transition:

- **Successful login/OAuth callback:** how to obtain the canonical session; when Router context is recomputed; whether data from a previous identity is possible.
- **Signup awaiting verification:** whether Better Auth creates a session before verification; whether the UI models "signed in but unverified" or a separate pending state; which query result should be cached.
- **Email verification:** hard reload versus an explicit session refetch plus Router invalidation. [`email-verified.tsx`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/routes/_auth-pages/email-verified.tsx) currently uses `reloadDocument: true`, which reliably crosses the SSR/session boundary but pays for a full reload.
- **Logout/account deletion/session revocation:** immediate removal of session UI, server confirmation/failure behavior, Router recomputation, and deletion or namespacing of user-owned cached data.

The current logout path in [`app-navigation.tsx`](https://github.com/alerecchi/productivity-up/blob/9a8cb435815cd6cf9d852d8ac204c2e378cfbf8b/src/features/shared/components/app-navigation/app-navigation.tsx) correctly invalidates the session query and then Router. However, board query keys such as `['board']`, `['categories']`, `['tags']`, and `['todos', bucketId]` contain no user identity and are not removed at logout. Even when loaders normally refetch before use, retaining one user's private rows across an account switch is avoidable state and becomes more dangerous if persistence, placeholders, or different stale times are added later.

Viable policies to decide between are:

- include stable user identity in every user-owned query key;
- remove all protected query families on identity loss/change;
- clear the whole QueryClient on logout/account switch and then seed/refetch public data;
- combine user-scoped keys with removal as defense in depth.

Targeted invalidation is normally preferable for ordinary resource mutations; an identity boundary is unusual enough that broader removal may be justified. The specification should name the protected query families and exact behavior instead of relying on an unfiltered reset accidentally doing the cleanup.

## Form submission and server errors

### The current validator pattern is supported

TanStack Form explicitly documents calling one server endpoint from the form-level `onSubmitAsync` validator and returning:

```ts
{
  form: 'A form-wide message',
  fields: {
    email: 'A field-specific message',
  },
}
```

Returning no error allows the subsequent `onSubmit` happy path to run. The login/signup design is therefore supported by the library. ([Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation#setting-field-level-errors-from-the-forms-validators))

The repository already has useful shared Form primitives via `createFormHook`, a form-level alert, password/text fields, and a submit button driven by Form's `canSubmit`/`isSubmitting`. The opportunity is to standardize the auth adapter around those primitives rather than replace them.

### Error taxonomy needs one contract

Current flows mix four behaviors:

- signup maps selected Better Auth codes into `{ fields }` and everything else into `{ form }`;
- login maps invalid credentials to `{ form }`, but throws `navigate(...)` for an unverified email;
- reset flows return only generic `{ form }` messages;
- transport exceptions are not consistently caught and normalized.

TanStack Form can represent field and form errors, but the auth layer must first classify provider results. A shared contract could distinguish at least:

- field-correctable input errors;
- form-level credential/policy errors safe to show;
- flow transitions such as "verification required";
- retryable network/service failures;
- unexpected failures for logging plus a safe user message.

The specific messages and Better Auth mapping belong to the auth-flow design. The TanStack constraint is that a resolved error value must be converted to Form's error shape (or thrown as an intentional typed error before Query callbacks), while an async operation must be awaited so `isSubmitting` remains accurate. ([Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [Form submission](https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling))

### Concrete form-level opportunities

- `throw navigate({ to: '/email-confirmation' })` in login conflates navigation with validation failure. Router's documented route-guard mechanism is `throw redirect(...)` inside `beforeLoad`; in an event/form callback, navigation is an async effect that should be deliberately awaited or sequenced after successful classification. The target flow should make "unverified" either a successful state transition or a returned form error, not an accidental thrown promise. ([Router redirects](https://tanstack.com/router/latest/docs/guide/authenticated-routes#redirecting))
- `ResetPasswordRequest` calls `form.setErrorMap(...)` during React render when the route has a token error. `setErrorMap` is an imperative update; the target should decide whether token errors are route state, initial/server form state, or an effect-driven form update. Keeping the mutation out of render avoids repeated side effects. ([Form `setErrorMap`](https://tanstack.com/form/latest/docs/reference/classes/FormApi#seterrormap))
- Validation schemas and Better Auth error-code maps can be shared by flow, while still using TanStack Form's field listeners for cross-field confirmation. Form's `formOptions` is intended for reusable typed options. ([Form basic concepts](https://tanstack.com/form/latest/docs/framework/react/guides/basic-concepts#form-options))
- TanStack Form's Start integration offers `formOptions`, server validation, and merged server form state for native/server-function submission. It is a candidate when progressive enhancement or a Start server-function boundary is desired, but it is not automatically superior to Better Auth's browser client for cookie-setting auth endpoints. That choice should be made per flow. ([Form Start integration](https://tanstack.com/form/latest/docs/framework/react/guides/ssr#start-integration))

## Redirect semantics

The repository correctly throws Router `redirect(...)` from `beforeLoad` helpers. Router recommends carrying `location.href` in a redirect search parameter and, after login, returning the user to it. It also notes that `location.href`, not `router.state.resolvedLocation`, is the current attempted URL. ([Router authenticated routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes#redirecting))

The login route currently neither validates a redirect search parameter nor consumes it; successful login always navigates to `/board`. The target flow should define:

- a typed `validateSearch` schema for the return target;
- an allowlist/internal-URL rule so an attacker cannot create an external open redirect;
- fallback targets for missing/invalid values;
- history behavior (`replace` versus push) after login/logout;
- the same callback policy for email verification and OAuth.

Router can type and validate search parameters, but application policy must decide which URLs are safe. ([Router search-parameter validation](https://tanstack.com/router/latest/docs/guide/search-params#validating-and-typing-search-params))

When an auth mutation changes state in the current document, the ordering should be explicit. One generic sequence to evaluate is:

1. auth provider confirms the transition;
2. canonical session Query is installed, invalidated and fetched, or removed according to the transition;
3. protected user-data cache policy is applied if identity changed;
4. `router.invalidate({ sync: true })` recomputes guards/context when the next navigation depends on the new state;
5. navigation uses the validated return target.

`sync: true` is available when code must await all invalidated loaders; without it, Router invalidation is stale-while-revalidate. This sequence is a decision aid, not a prescribed universal helper: a full-document OAuth or email callback can intentionally replace steps 2–4 with a fresh request. ([Router `.invalidate`](https://tanstack.com/router/latest/docs/api/router/RouterType#invalidate-method), [Router data mutations](https://tanstack.com/router/latest/docs/guide/data-mutations#invalidating-tanstack-router-after-a-mutation))

## Questions the auth specification must resolve

1. What session freshness is acceptable for navigation chrome, and which events force an immediate refresh (login, logout, OAuth return, verification, password change, focus, cross-tab signal, 401)?
2. Is Query the sole client cache for session data, or does Better Auth maintain a second reactive owner? How is Router context derived and refreshed?
3. Should protected routes remain client-only, move to `data-only`, or regain full SSR?
4. Will auth guarding live in an actual `_authenticated` pathless layout, leaf routes, or both?
5. What exact protected query families are removed or user-namespaced on logout/account switch/deletion?
6. Which auth calls benefit from Query mutation state, and which are simpler as TanStack Form async submission plus a shared transition service?
7. What typed result/error union sits between Better Auth and Form, and which outcomes are validation errors versus navigation transitions?
8. What return-target schema and internal-redirect policy is shared across login, OAuth, verification, and reset flows?
9. Which transitions intentionally hard-reload, and which must work via Query plus Router invalidation?
10. How are route guards and server middleware tested independently so a UX refactor cannot weaken the data boundary?

## Primary sources

- [TanStack Start: Authentication](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
- [TanStack Start: Selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr)
- [TanStack Router: Authenticated Routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes)
- [TanStack Router: Query Integration](https://tanstack.com/router/latest/docs/integrations/query)
- [TanStack Router: Data Loading](https://tanstack.com/router/latest/docs/guide/data-loading)
- [TanStack Router: Router Context](https://tanstack.com/router/latest/docs/guide/router-context)
- [TanStack Router: Router API](https://tanstack.com/router/latest/docs/api/router/RouterType)
- [TanStack Query: QueryClient](https://tanstack.com/query/latest/docs/reference/QueryClient)
- [TanStack Query: SSR and Hydration](https://tanstack.com/query/latest/docs/framework/react/guides/ssr)
- [TanStack Query: Invalidations from Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)
- [TanStack Query: `useMutation`](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation)
- [TanStack Form: Validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation)
- [TanStack Form: Submission Handling](https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling)
- [TanStack Form: React Meta-Framework Usage](https://tanstack.com/form/latest/docs/framework/react/guides/ssr)
- [TanStack Router SSR Query integration source](https://github.com/TanStack/router/blob/main/packages/router-ssr-query-core/src/index.ts)
