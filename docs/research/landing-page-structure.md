# Landing-page structure for a free productivity app

Research date: 2026-10-18. Ticket: #143 (map #137).

## Summary

Productivity Up has no landing page yet. `src/routes/index.tsx` is a placeholder, and the root `<title>` is still `TanStack Start Starter`.

The research points to a short, plain-language page. It should show the product instead of describing it, and it should explain the bucket flow in the hero itself, with one animated board and not a separate tour. Visitors judge a page within about 10 seconds. Simple copy roughly doubles conversion compared with professional-grade prose. Every comparable product puts a real product visual right under the headline. Because the app is free, "free" is the strongest friction remover available and belongs next to every CTA.

For SEO, the essentials are a descriptive `<title>` and `<h1>`, a unique meta description, Open Graph tags with `og:image:alt`, `WebSite` structured data for the site name, a crawlable favicon, and good Core Web Vitals. `SoftwareApplication` rich results are not reachable without real ratings, so do not chase them.

The recommended outline is at the end.

## What the research says about conversion

**The first 10 seconds decide the visit.** NN/g, summarising a Microsoft Research study of over 2 billion dwell times, reports that the chance of leaving is highest in the first 10 seconds. Pages that hold attention for about 30 seconds often keep visitors for 2 minutes or more. Their takeaway: "clearly communicate your value proposition within 10 seconds." [NN/g, How Long Do Users Stay on Web Pages?](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/)

**Attention is concentrated at the top.** In NN/g's 2018 eye-tracking study, 57% of viewing time went above the fold, 74% to the first two screenfuls, and 81% to the first three. NN/g recommends putting high-priority content and the main CTA above the fold, and avoiding "false floors" that hide the fact that the page continues. [NN/g, Scrolling and Attention](https://www.nngroup.com/articles/scrolling-and-attention/)

**State what it does, then show real content.** NN/g's homepage guidelines say to "start the page with a tagline that summarizes what the site or company does," especially for a new or unknown company. They also advise: "Specifics beat abstractions." Show real content instead of describing it. [NN/g, Top 10 Guidelines for Homepage Usability](https://www.nngroup.com/articles/top-ten-guidelines-for-homepage-usability/)

**Plain, short copy converts better.** Unbounce's 2024 Conversion Benchmark Report covers 41,000+ landing pages and 57M+ conversions. Pages written at a 5th to 7th grade reading level converted at 11.1%. That is 56% higher than 8th to 9th grade copy and more than twice the rate of professional-level copy (5.3%). Word count correlated negatively with conversion (-18.6%), and so did difficult words (-24.3%). [Unbounce 2024 Conversion Benchmark Report](https://unbounce.com/conversion-benchmark-report/) Unbounce's 2020 report found that SaaS pages were the hardest to read of every industry analysed. [Unbounce 2020 report](https://unbounce.com/conversion-benchmark-report-2020/) This supports map #137's copy finding that words like "migration" and "carry forward" are jargon.

Caveat: Unbounce's figures are correlations across paid-traffic landing pages, not controlled experiments. They point in a direction but promise no specific lift.

## How comparable products structure their pages

All pages were fetched on 2026-10-18.

| Product                                    | Hero headline                                                                          | Primary CTA and friction note                                    | Visual under hero                                          | Social proof                                    | How it works                                                       | FAQ                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| [Todoist](https://www.todoist.com/)        | "Clarity, finally." Sub: "Join 50+ million professionals…"                             | "Start for free"                                                 | Real app screenshot                                        | 347K+ reviews, press quotes, case studies       | Feature sections (capture, Today/Upcoming, scheduling)             | None                    |
| [Sunsama](https://www.sunsama.com/)        | "Start Calm. Stay Focused. End Confident."                                             | "Try for free" plus "14-day free trial, no credit card required" | Home view screenshot                                       | Logo row, Wirecutter badge, named testimonials  | Three stages (start, during, end of day) that mirror the headline  | None                    |
| [TickTick](https://ticktick.com/)          | "Stay Organized, Stay Creative."                                                       | "Get Started" and "Download"                                     | Feature blocks                                             | MKBHD quote, review carousel                    | Feature tabs                                                       | Linked from footer      |
| [Akiflow](https://akiflow.com/)            | "One app for tasks & calendars, powered by AI"                                         | "Try Akiflow for free" plus "7 days free. Cancel anytime."       | Product mockup                                             | YC backing, review-site badges                  | Feature sections                                                   | None                    |
| [Linear](https://linear.app/)              | "The product development system for teams and agents"                                  | "Get started"                                                    | UI mockups with realistic sample data, labelled as figures | Logos, three named quotes, "40,000+ teams"      | Feature sections by workflow stage                                 | None                    |
| [Amie](https://amie.so/)                   | "Run your workday on autopilot with AI agents"                                         | "Get started"                                                    | Screenshot plus logo row                                   | Testimonials placed next to the related feature | Explicit three-step section and a "Today / Day 3 / Day 7" timeline | Yes, with support email |
| [Tweek](https://tweek.so/)                 | "Tweek is a minimal weekly planner & todo list app."                                   | Download links only                                              | Week view                                                  | None                                            | One section per feature                                            | Yes ("Got questions?")  |
| [Things](https://culturedcode.com/things/) | "Things." Sub: "the award-winning personal task manager that helps you plan your day." | "Watch Introduction Video"                                       | Video and device cards                                     | Apple Design Award, review excerpts             | On a separate features page                                        | None                    |

Height was excluded because it shut down on 2025-09-24. [AlternativeTo](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/)

### Patterns

1. **The hero is short, plus a real product visual.** Every page puts the product UI directly under or beside the headline. Linear and Amie use mockups filled with realistic sample data instead of abstract illustrations.
2. **Friction notes sit next to the CTA.** Sunsama and Akiflow add a microline under the button ("no credit card required", "Cancel anytime"). For a free-forever app, "Free forever. No credit card." is a stronger version of the same pattern.
3. **Concept-led products use a numbered sequence.** Sunsama's whole page follows its ritual (start, during, end of day), and the headline echoes it. Amie uses a "Today / Day 3 / Day 7" progression. Both explain the product as a flow over time, which is the closest analogue to buckets flowing from This Year to Today.
4. **Naming views is not explaining them.** Things' features page describes Today and Upcoming in prose, but leaves Anytime out and barely mentions Someday. Captions are generic, so a newcomer has to open the app to understand the model. [Things features](https://culturedcode.com/things/features/) This is the anti-pattern to avoid.
5. **Social proof is the one thing a new app lacks.** Incumbents rely on user counts, logos, press, and named quotes. None of these exist for Productivity Up yet. The honest substitutes are listed under social proof below.
6. **FAQs are rare among big players but common among smaller ones.** Tweek and Amie use FAQs to handle objections like pricing, data, and platforms. For an unknown, free, EU-based app, "Is it really free?", "What happens to my data?", and "What happens to unfinished todos?" are real objections. An FAQ is warranted.
7. **A closing CTA repeats the offer.** Todoist, Sunsama, TickTick, Linear, and Akiflow all end with a final headline and CTA before the footer.
8. **The footer carries legal links and secondary navigation.** Legal links (Privacy, Terms) appear in every footer. That matters here because the app is EU-based and uses Google sign-in.

## Explaining the bucket flow in seconds

The concept is unfamiliar, but it rests on a structure everyone already knows: year, month, week, day. The explanation should lean on that and avoid domain jargon.

1. **Name the outcome first and the mechanism second.** In the headline, sell the feeling: knowing what matters today without losing sight of the year. In the subheadline, name the mechanism in one plain sentence. Sunsama's headline mirrors its three-step ritual, so the headline itself teaches the model.
2. **Show it as a moving picture in the hero.** Use a looping, compact board with four columns labelled This Year, This Month, This Week, Today. A single todo card should slide one step narrower at a time, and the Today card should get checked off. This is the "show real content" guideline applied to a concept. It also fits inside the 10-second window because nothing has to be read. Use real UI (the real CSS and components, per map #137), not an illustration.
   - **Accessibility:** if the loop runs longer than 5 seconds next to other content, WCAG 2.2.2 requires a way to pause, stop, or hide it. [WCAG 2.2 Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) Honour `prefers-reduced-motion` with a static board that shows arrows, and give the animation a text alternative that says the same thing as the subheadline.
   - **Mobile:** show the four buckets stacked vertically, or as a horizontal strip with the card moving between them. Don't shrink the desktop board.
3. **Follow with three steps that reuse the bucket names.** A numbered strip of at most three steps, each one line long:
   1. "Drop everything in a bucket." Big goals go in This Year, smaller things in This Month.
   2. "Move it closer as it gets real." Drag todos from This Year → This Month → This Week → Today.
   3. "Finish the day, keep what's left." Unfinished todos come with you or go back up a level. No guilt, no lost tasks.

   This explains bucket migration without using the word "migration," in line with map #137's vocabulary decision. The final user-facing terms belong to the design guide's vocabulary table.

4. **Use the bucket labels as anchors.** "This Year / This Month / This Week / Today" are self-explanatory. Use them verbatim in the hero visual, the steps, and the product shots so the concept is learned once and recognised everywhere.
5. **Keep every block within a grade 5 to 7 reading level and short overall.** Unbounce's data supports this. Run the copy through a Flesch-Kincaid check as part of the copy-deck ticket.

## SEO and meta essentials

These are owned by the brand-assets and meta part of the design guide ticket, but the landing page depends on them.

- **`<title>`:** unique and descriptive, with the brand included. The home page is the right place for a slightly longer description. Avoid vague labels and keyword stuffing. Make the visible `<h1>` match the title. [Google, Title links](https://developers.google.com/search/docs/appearance/title-link) NN/g also recommends starting the window title with the company name followed by a short description. Example: `Productivity Up: plan your year, month, week and today`.
- **Meta description:** unique, readable, and summarising the page. Google sets no length limit but truncates by device width, and it may write its own snippet from page content. [Google, Snippets](https://developers.google.com/search/docs/appearance/snippet) Mention "free" and the bucket idea in about one to two sentences.
- **Open Graph:** the required properties are `og:title`, `og:type`, `og:image`, and `og:url`. Also add `og:description`, `og:site_name`, `og:image:alt`, and `og:image:width`/`height`. [The Open Graph protocol](https://ogp.me/) The OG image is a brand asset, so it is a natural reuse of the hero board still.
- **Site name:** add `WebSite` JSON-LD (`name`, `url`, optional `alternateName`) on the home page only. Google weights it above `og:site_name` and `<title>` when choosing the site name. [Google, Site names](https://developers.google.com/search/docs/appearance/site-names)
- **Favicon:** use a square favicon, larger than 48×48 recommended, linked from the home page with `rel="icon"` and/or `apple-touch-icon`. Both the favicon and the home page must be crawlable, and the URL should stay stable. [Google, Favicon](https://developers.google.com/search/docs/appearance/favicon-in-search)
- **Skip `SoftwareApplication` rich results for now.** They require `aggregateRating` or `review` plus `offers.price` (`0` for free). Without real ratings the page is not eligible, and invented ratings violate the guidelines and risk a manual action. [Google, Software app structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app) Revisit once real reviews exist.
- **Performance:** Core Web Vitals "good" thresholds at p75 are LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1. [web.dev, Web Vitals](https://web.dev/articles/vitals) The hero visual will be the LCP element, so it should be server-rendered HTML/CSS (cheap on Workers with SSR) rather than a heavy video. Reserve its dimensions to avoid layout shift, and keep the animation CSS or transform-based.
- **Implementation note (inference):** the landing page lives at `/`, which is SSR'd and public, and redirects signed-in users. TanStack Start's per-route `head()` can carry the meta and JSON-LD. The root `head()` currently only sets the starter title.

## Social proof without users

Fabricated testimonials or counts are off the table. These are honest substitutes, in rough order of strength:

1. **The product itself:** the live, interactive hero board is the proof.
2. **A founder note.** One short paragraph on why the app exists and why it is free. This also serves NN/g's guidance to show who is behind the site.
3. **Concrete trust facts:** "Free forever", "EU-based", "Sign in with Google", "Your data isn't sold". Each one needs to be true and backed by the legal pages.
4. **Real quotes later.** Add a testimonial block once early users exist. Following Amie, place each quote next to the feature it praises.

## Recommended section outline

The page is mobile-first. Every section is one screen or less on mobile, and the copy is grade 5 to 7. The first three sections carry the page, since they get about 81% of attention.

1. **Header:** logo and name, a "Sign in" link, and a primary "Start free" button. No other nav until there are more pages.
2. **Hero:** above the fold on mobile.
   - H1 (outcome): for example, "Big plans, clear days."
   - Subheadline (mechanism, one sentence): "Put todos in This Year, This Month, This Week and Today, then move them closer as the day gets near."
   - CTA: "Start free with Google" plus the microline "Free forever. No credit card."
   - The animated bucket board (real components, reduced-motion fallback, pause control). On mobile it sits under the CTA. On desktop it sits beside or below the text.
3. **How it works:** three numbered steps (add, move closer, finish the day) that reuse the bucket labels. Each step has a small real-UI still.
4. **What the end of the day looks like:** the end-of-day review and recap, shown as a gentle, guilt-free ritual. This is the second differentiator after the bucket flow. Name it in the user-facing vocabulary, never "migration."
5. **Small feature row:** three or four items at most, such as drag and drop with a keyboard alternative, works on phone and desktop, light and dark themes, and syncs across devices. One line each.
6. **Why it's free / who's behind it:** the founder note plus trust facts (EU-based, data stance).
7. **FAQ:** four to six questions, for example "Is it really free?", "What happens to unfinished todos?", "Do I need a Google account?", "Where is my data stored?", "Can I use it on my phone?", and "Can I export or delete my data?" Use a shadcn Accordion. Optionally add `FAQPage` markup, but Google limits FAQ rich results, so treat it as low value.
8. **Closing CTA:** restate the outcome ("Plan the year. Finish today.") with the same button and microline.
9. **Footer:** Privacy, Terms (and Cookies if needed), contact, © and EU entity line, and a theme toggle.

Left out on purpose: logo walls, user counts, ratings, comparison tables, pricing tiers, and auto-rotating testimonial carousels. None of these can be filled honestly yet, and empty slots hurt credibility more than leaving them out.

## Open questions for the prototype ticket

- Should the hero board be interactive (visitors drag a card themselves) or only animated? Interactive is more memorable, but it needs the keyboard alternative and could compete with the CTA. Test both in the prototype.
- What is the final user-facing wording for "Bucket", "Bucket Migration", and "Completion Recap"? This is decided by the design guide's vocabulary table and feeds the hero, step 3, and section 4.
- Should the hero show a single CTA ("Start free with Google"), or a secondary "See how it works" anchor as well? The sources show both patterns, so no strong preference.
