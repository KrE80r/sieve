# Sieve Mobile App Development Plan

Status: implemented through an emulator-verified private profile APK after local system
inspection, TDD, and an independent Claude technical and product red-team review.
Physical-phone visual, touch, performance, and signed-APK installation acceptance remains
open.

## 1. Decision and recommendation

The product direction is sound: Sieve can have an Android reading client without
becoming a feed manager, bookmark archive, or another attention-seeking surface.
FeedSieve remains the producer, the existing website remains available, and the app is
a finite local reading surface over the same published content.

The technical implementation is feasible with the current GitHub Pages backend. No
account service, dynamic API, or user-state server is required.

The user has explicitly selected a private Android APK. Flutter is therefore the
recommended client: not because the web is incapable of local state, but because the
product value includes a deliberately native-quality, highly tailored visual and touch
experience on one known phone. Physical-device visual and scrolling quality must be
proved before creating a permanent mobile feed contract.

## 2. Product boundary

The app has exactly three destinations:

1. **Articles** — the current finite Sieve article review, text-first, with meaningful
   imagery when the producer has it.
2. **Developments** — sealed, chronological X-list editions with attribution, coverage
   state, meaningful media, the next scheduled release, and the existing 24-hour expiry.
3. **Read Later** — a small, finite, device-local queue of online bookmarks for Sieve
   Articles only.

Non-negotiable exclusions:

- no notifications, notification permission, badge, reminder, or foreground service;
- no infinite scroll, auto-next, streak, recommendation, engagement ranking, or refresh
  reward;
- no feed/source management, URL import, Android share target, folders, user-created tags, boards,
  permanent archive, or cross-device synchronization;
- no analytics SDK or behavioural tracking;
- no saving Developments in v1;
- no source-article download, offline-article promise, or reader-mode scraping.

The app does not add new information intelligence. Its value is presentation, deliberate
review, durable device-local continuity, and a deliberately constrained bridge to the
original article. It is a private presentation client for public Sieve content, not a
publicly distributed product.

## 3. Approved Read Later contract

Approved v1 rule: **seven slots, no automatic expiry**.

- Saving copies the article title, source, summary, score, image reference, original URL,
  and save time into a self-contained local record.
- Those saved fields are a point-in-time capture and are never silently rewritten from a
  later Article snapshot. The image URL is best-effort; the local metadata and original
  URL are the device-local promise until explicit removal.
- The saved record does not depend on the article remaining in FeedSieve or retaining the
  same remote identifier.
- A saved item remains until `Remove`, app uninstall, or app-data clearing. `Remove` is
  reversible for a few seconds with `Undo`.
- When all seven slots are occupied, the app does not create an eighth item; the reader
  must finish or remove one first.
- Uninstalling the app or clearing its data removes the queue.
- The original page can disappear independently; the app promises the saved metadata and
  URL, not permanent possession of the source article.
- Read Later is an online bookmark: opening it requires connectivity and hands the URL to
  Android's default browser. The app never caches the source article body.

The seven-slot capacity is the strategic safeguard against Read Later becoming the
bookmark graveyard that Sieve is intended to avoid. The app never silently evicts an
intentional save.

## 4. Architecture

```text
FeedSieve producer
    |
    | publishes static, versioned JSON
    v
Sieve GitHub Pages --------------------- Existing website
    |
    | HTTPS + ETag
    v
Android client
    |
    +-- accepted remote snapshot
    +-- seen/unread state
    +-- expiring Developments
    +-- self-contained Read Later queue
```

Repository ownership:

- `feedsieve`: producer projection, identity/expiry fields, and contract tests;
- `sieve`: published JSON and the existing website;
- new `sieve-mobile`: Flutter client, local data, Android packaging, and app tests.

The production app uses one local SQLite writer on the foreground app isolate. Screens
render from local data; network responses are validated and reconciled first. The v1 app
has no background worker. It checks quietly on launch or resume when stale and otherwise
uses the last valid snapshot as resilience, not as a promised offline-reading mode.

## 5. Remote data contracts

### Articles mobile v1

After the technology/value gate passes, FeedSieve adds
`data/mobile/v1/articles.json` without changing the website's `data/feed.json`.

Top-level fields:

- `schema_version: 1`
- `sequence` — an atomically increasing producer counter used to reject reordered
  deliveries independently of wall-clock changes
- `revision` — content hash for no-op detection
- timezone-aware UTC `generated_at` — records when the producer assembled the snapshot;
  ordering is controlled by `sequence`, not the wall clock
- `complete: true`
- `total_items`
- `items`

Each item contains:

- an opaque, producer-assigned stable `article_id` based on the immutable database row,
  not an app-derived URL hash;
- HTTPS `original_url`;
- `title`, `summary`, `rating`, `rating_reason`, and `labels`;
- `source_id`, `source_name`, and `source_type`;
- `admitted_at`, optional `source_published_at`, and explicit `expires_at`;
- optional validated image URL, dimensions, and alt text.

`expires_at` is the only client authority for article expiry. The client never derives it
from a retention-day setting. FeedSieve can update it in a later accepted snapshot.
Articles are filtered and ordered by `admitted_at`, preserving Sieve's current "when it
entered your review" semantics. `source_published_at`, when known, is secondary context
only and never controls admission or expiry.

A payload may replace the local active snapshot only when:

1. its schema is supported;
2. every required field and URL validates;
3. `complete` is true and `items.length == total_items`;
4. its `sequence` is greater than the accepted sequence;
5. its revision differs.

An identical revision is a no-op, regardless of a later delivery time.

Malformed, incomplete, unknown-schema, or reordered payloads cannot trigger deletion. The app
keeps the last known good snapshot and can add nothing from an unaccepted payload.

### Developments v2

The app consumes the existing `data/awareness.json` schema v2. It uses each published
`expires_at` as the sole expiry authority, preserves incomplete coverage labels, and
keeps the last valid edition if an unknown schema or invalid payload appears. A timer
removes expired entries while the app remains open.

### Images

The interface is text-first because current source imagery is sparse, but every useful
public image published by Sieve should contribute to the finest available preview. In
v1, public HTTPS images are fetched through an app-owned client with no cookie store or
referrer header and a bounded, pre-sized cache. Direct fetching reveals the device's IP
address and network client to the public image host. That is acceptable for this private
client of already-public Sieve content. Rehosting is unnecessary unless reliability
testing proves otherwise.

## 6. Local data and cleanup

Use separate records rather than coupling saved content to active-feed rows:

- `active_articles`: current accepted Articles snapshot;
- `article_state`: seen/unread state for active articles;
- `developments`: current accepted edition and published expiry;
- `read_later`: self-contained saved snapshots without automatic expiry;
- `content_state`: accepted revisions, ETags, generated times, last success, and errors.

All stored timestamps are UTC epoch milliseconds. Display conversion happens only at the
UI boundary.

Cleanup rules are independent and unambiguous:

- Replace `active_articles` only after accepting a complete newer snapshot.
- Delete active articles absent from that accepted snapshot; this never deletes a
  `read_later` snapshot.
- Delete a Read Later item only on explicit `Remove` or app-data removal. A database
  migration preserves saves made under the earlier seven-day contract.
- Delete Developments exactly at the producer-published `expires_at`, online or offline.
- Bound and age out image cache entries separately from content state.

## 7. Visual and interaction quality contract

Visual quality and touch behavior are core functionality, not end-of-project polish.
Every production slice must meet this contract on the user's physical phone.

### Visual direction

- Preserve Sieve's dark editorial identity, score circles, meaningful score colours,
  strong typography, and calm reading rhythm. Borrow Feedly's clarity, not its backlog or
  generic feed-reader appearance.
- Use one persistent three-destination mobile navigation treatment; never introduce a
  mobile sidebar.
- Compose image and text-only records as two intentional card variants. Missing imagery
  must never produce a visibly cheaper, shorter, or broken-looking card.
- Reserve image geometry before loading so text and controls never jump. Crop only to a
  deliberate preview ratio and provide the uncropped source in the default browser.
- Use real Sieve content from the first design pass: long titles, sparse images, multiple
  labels, weak summaries, failed media, and empty/end states.
- Keep decoration subordinate to reading. Avoid generic gradients, excessive rounding,
  heavy shadows, blur, shimmer, looping animation, and ornamental motion in the feed.
- Respect system text scaling, contrast, semantic reading order, and reduced motion.

### Full-surface scrolling and touch

- Each destination has one primary, full-width vertical `CustomScrollView`/sliver tree.
  There are no nested vertical scroll regions and no narrow middle-only scroll target.
- A vertical drag beginning over a card, text, image, empty gutter, or within the left or
  right 24dp edge strip scrolls the same list. Transparent overlays and decorative layers
  must ignore pointer input.
- Preserve Android's native scroll physics and momentum rather than inventing custom
  resistance. Horizontal system-back gestures remain Android-owned.
- Buttons participate correctly in Flutter's gesture arena: a tap activates them, while a
  vertical drag over them yields to scrolling and does not open or save by accident.
- Interactive targets are at least 48dp, safe areas are respected, and the current scroll
  position is restored independently for Articles, Developments, and Read Later.
- No automatic scroll, snap-to-card, forced pagination, horizontal content carousel, or
  gesture that hides the finite end of the list.

### Article review filters and order

Time, source, and topic are independent narrowing facets over one finite Article review.
The app must not repeat the website behavior where choosing one facet silently clears
another. Sort is a separate ordering choice and never changes review membership.

- The visible narrowing controls are `Today`, `Last 7 days`, or `All active`; `All
  sources` or one explicit source; and `All topics` or one producer-supplied Article
  topic. `Last 7 days` is a rolling window and is named literally rather than ambiguously
  labelled "This week".
- Topic is single-select. It presents the existing producer labels as human-facing
  reading topics, not user-managed tags, and does not offer multi-select AND/OR logic.
  Untagged Articles remain in `All topics` and are not assigned a synthetic topic.
- Changing any narrowing facet preserves the other two and the current order. Counts in
  each picker are scoped to the current selections in the other two facets. Topic counts
  may overlap because one Article can belong to more than one topic; they are never
  presented as a partition of the total.
- Article order is either `Latest` (the default, by `admitted_at` descending) or `Best
  Rated` (by rating descending). Both use `admitted_at` descending and then stable
  `article_id` ascending tie-breaks. Sort is visually distinct from the narrowing facets
  and carries no count.
- Any filter change returns the Articles review to its beginning. Switching destinations
  and returning preserves both the filter and that destination's scroll position.
- A valid remote refresh or warm resume preserves the current combination. If it now
  yields zero articles, the app keeps every choice visible and presents explicit actions
  to clear the source, clear the topic, or broaden the window. It never resets a filter
  merely to avoid an empty state.
- A true cold launch starts at `Today · All sources · All topics · Latest`. This prevents
  an old narrow choice from silently hiding a later Sieve edition.
- The source sheet may search source names locally, but that query is picker navigation,
  not another persistent content filter.
- Developments has no author/source filter: provenance remains visible, but the sealed
  edition is consumed as one complete editorial briefing. Read Later remains its fixed,
  seven-slot queue.

### Cross-feature interaction contract

The governing rule is: preserve deliberate choices within the current app session,
reset transient presentation state on a true cold launch, and persist only bounded local
actions whose value survives the remote feed.

| Features that meet | Required behavior |
| --- | --- |
| Time window + source + topic | They remain independent facets. Changing one never clears the others. Each picker count is scoped to the other two selected facets. |
| Narrowing facets + sort | Sort changes order only and preserves all three facets. Changing any facet preserves sort. Any deliberate change returns Articles to the top. |
| Filters + zero results | Keep every selection visible. Offer explicit `Clear source`, `Clear topic`, and/or `Show all active` actions; never silently broaden the result. |
| Selected source + remote rename | Preserve the stable source identity and adopt its current display name. |
| Selected source + disappearance | Keep the now-empty selection visible until the reader clears or broadens it. Do not substitute another source. |
| Filters + tab switch or valid refresh | Preserve the window, source, topic, and order for the current session. A true cold launch alone resets to `Today · All sources · All topics · Latest`. |
| Destination switch or repeated tap | Preserve each destination's reading position. Tapping the already-selected destination is a no-op; only an intentional filter change or a genuinely new Developments edition starts at the top. |
| Android Back + secondary destination | Return to Articles while preserving its filters and reading position. Back on Articles exits; Back never rewinds a filter choice. |
| Rotation + current session | Treat rotation as a layout change, not a cold launch. Preserve the active destination, Article facets, order, and each destination's reading position. |
| Same Developments edition + tab switch | Preserve its reading position. |
| New Developments edition + old scroll position | Treat the new batch as a new document and begin at its top. Never land halfway through it. |
| Browser handoff + seen state | Mark an Article seen only after Android accepts the URL for the external browser. A failed handoff leaves it unread. |
| Seen state + Article ordering | Dim the Article in place without removing or reordering it. `Mark unread` restores it without moving it. |
| Read Later + remote Article cleanup | Keep the self-contained local entry and original URL until explicit `Remove`. |
| Read Later + duplicate/full queue | Never duplicate, evict, or create an eighth item. The reader removes one before saving another. |
| Read Later original + active Article | A successful browser handoff marks the matching active Article seen; the queue entry remains until explicit `Remove`. |
| Pull refresh + recent/in-flight check | Articles and Developments expose the standard pull gesture. Debounce a fully verified check for 30 seconds, ignore an overlapping pull, show no count or reward animation, and never expose the gesture in local Read Later. |
| Failed refresh + valid local copy | Keep the last verified content and show a quiet status on that remote-content view. A later pull may try once; there is no automatic retry, retry button, or notification. |
| Failed refresh + no valid local copy | Say that no verified review is available. Do not present failure as a healthy empty review; keep the local Read Later destination usable and allow the same quiet pull check. |
| Article/Development expiry + foreground/background | Filter on every load, render, and resume. A foreground timer improves immediacy but is never the authority. |
| Process death + local state | Reset tabs, filters, order, picker queries, and scroll. Persist only the bounded Read Later queue and seen/unread state for still-active Articles. |
| Failed image + readable content | Keep reserved geometry and show a quiet unavailable state; title, summary, score, reason, and actions remain usable. |

### Smoothness and performance

- Lazily build visible records with stable keys. Do not build all current articles into
  the widget tree at once.
- Decode images near their rendered dimensions, prefetch only a small viewport margin,
  and use a byte-bounded cache. Image work must not block the UI isolate.
- Avoid expensive clipping, opacity layers, physical shadows, and blur inside the moving
  list. Animate only motivated transform/opacity changes.
- Profile in Flutter profile mode on the actual phone, at its real refresh rate. Steady
  drag and fling must remain within the device frame budget with no repeatable janky
  sequence; a debug-build impression is not acceptance evidence.
- Capture repeatable scroll traces for image-heavy, text-only, long-title, and mixed lists
  after each vertical slice, not only before release.

### Visual acceptance gate

Before backend contract work begins, the real-data prototype must be installed on the
phone and pass all of these checks:

- vertical scrolling feels native from the centre and both side edges;
- no tap is accidentally triggered during a drag;
- image loading causes no layout shift or scroll-position jump;
- card hierarchy remains beautiful with and without imagery;
- type remains crisp and readable at the user's normal Android text scale;
- the three destinations, empty states, and finite endpoints are immediately legible;
- the user does not need to enumerate obvious visual or touch repairs after handoff.

Failure here stops implementation for design correction; it is not deferred to a later
"polish" phase.

## 8. Incremental delivery plan

### Phase 0 — Prove the native visual foundation

1. Confirm the seven-slot persistent Read Later rule and inspect the target phone's Android
   version, density, text scale, and refresh rate.
2. Establish the reusable Flutter visual foundation against current Sieve JSON/fixtures,
   including the full visual and interaction contract in section 7.
3. Install a signed development APK on the actual phone and profile touch, scroll, image
   loading, typography, navigation, and the full Articles → Read Later → browser flow.
4. Freeze the approved design tokens and component states before producer-contract work.

Stop here for correction if the APK is not already smooth, coherent, and visibly worthy
of replacing the website as the user's normal Sieve surface.

### Phase 1 — Freeze the producer contract

1. Add failing FeedSieve contract tests for stable opaque identity, source/admission time,
   explicit expiry, deterministic revision, completeness, optional imagery, and rejected
   unsafe URLs.
2. Implement the lightweight mobile Articles projection without altering `feed.json`.
3. Publish it atomically beside current Sieve assets.
4. Verify the live payload, ETag behavior, compression size, and unchanged website tests.

Checkpoint: do not build production persistence against an unfrozen payload.

### Phase 2 — Build the Android foundation

1. Create `sieve-mobile` with a minimal Flutter architecture: screens, repositories,
   remote clients, and a SQLite store. Avoid a general framework or background scheduler.
2. Add CI for formatting, static analysis, unit tests, Android debug/release builds, and
   secret-safe signing.
3. Implement last-known-good parsing, schema gates, ETag requests, deterministic
   reconciliation, producer-expiry timers, migrations, launch/resume refresh, and the
   debounced manual pull check.
4. Inspect the manifest to prove there is no notification, share/import, foreground
   service, WebView, or unnecessary permission.

Checkpoint: corrupt, incomplete, stale, and unknown-schema fixtures must leave local good
data untouched.

### Phase 3 — Deliver one vertical slice at a time

1. **Articles:** default to the finite Today review; preserve score circles and score
   colour, source, reading angle, text-first card quality, useful imagery, filters, seen
   state, `Mark unread`, `Read later`, `Read article`, and a visible end.
2. **Developments:** render the current editorial release shape with real attribution,
   chronology, coverage honesty, meaningful media, 24-hour expiry, and the next scheduled
   release visible only inside the Developments view.
3. **Read Later:** deliver the seven visible slots, local preview metadata, `Read article`,
   explicit `Remove`, and short `Undo`; no expiry, archive, or organizational features.

Opening an original sends the validated HTTPS URL to Android's default browser as an
external application. The app never renders arbitrary source HTML itself.

### Phase 4 — Harden and run the private device release

1. Test dynamic type, screen readers, contrast, reduced motion, small phones, rotation,
   text-only/image cards, and empty/end states. Tablet-specific work is deferred unless a
   tablet becomes an actual target.
2. Profile cold launch, JSON parse/reconciliation, SQLite operations, memory use, and
   image cache limits against the current 750-item snapshot.
3. Test first install offline, airplane-mode restart, source/image failure, device clock
   and timezone changes, low-memory restart, app upgrade, and expired content while open.
4. Install the signed private APK for the user and use it as the primary Sieve reader for
   a bounded trial. No store listing or third-party distribution work is included.

Release only if the app remains finite, quiet, and disciplined and is materially better
to use than the website. Pause if it encourages more frequent checking, the queue becomes
a backlog, or its visual and interaction quality does not justify the native surface.

## 9. Required test matrix

- Producer contract and golden JSON fixtures.
- Stable identity over title, summary, and image changes.
- Reject older revision; no-op identical revision.
- Reject valid JSON with incomplete item count without deleting local rows.
- Active article removal does not remove its independent Read Later snapshot.
- Read Later persists after remote cleanup and large clock jumps until explicit removal.
- Seven-slot enforcement, no silent expiry or eviction, `Remove`, short `Undo`, and
  legacy database migration without saved-item loss.
- Pull refresh on both remote views, 30-second debounce, one in-flight check, quiet
  updated/unchanged/failure feedback, and no pull gesture on Read Later.
- Unknown Articles or Developments schema keeps the last known good data.
- Developments expire while online, offline, after restart, and while the app is open.
- Image missing/failure/privacy-header and bounded-cache tests.
- Widget/golden tests for the real high-risk mobile layouts.
- Physical-device default-browser handoff, centre/edge scrolling, lifecycle, network
  failure, upgrade, and manifest inspection.
- Existing website regression suite after every producer change.

## 10. Claude review disposition

Accepted:

- define stable identity before production reconciliation;
- gate all absence-based deletion on a complete accepted payload;
- remove WorkManager/background warming from v1;
- make producer-published `expires_at` authoritative;
- fail soft on unknown schemas and stale payloads;
- make Read Later self-contained and count-bounded;
- state the offline promise honestly;
- defer tablet scope unless it becomes real.
- define Android Back as secondary destination to Articles, then exit from Articles;
- classify rotation as a session-preserving layout change rather than a cold launch;
- freeze Read Later metadata as a point-in-time capture and require explicit removal
  before a full-queue slot becomes available;
- allow a narrow pull-to-refresh gesture only for remote content, without counts,
  automatic retries, overlapping requests, or a reward animation.

Accepted with a different implementation:

- Identity should be stable, but a URL hash is not the right primary key because URL
  normalization can collapse legitimate URLs or still drift. Use an opaque immutable
  producer ID; copy saved metadata into Read Later so it survives remote identity loss.
- SQLite is unnecessary for the Phase 0 visual foundation, but justified for the production
  app's migrations, reconciliation, seen state, and expiring queue.
- Direct images have a privacy cost. Document and constrain them first; do not build an
  image-mirroring pipeline before evidence requires it.

Rejected:

- Behavioural analytics as the proof of value. Instrumenting an anti-attention personal
  reader to measure engagement contradicts the product direction. Use an explicit,
  bounded user evaluation with no tracking.
- Requiring a PWA comparison after the user explicitly selected a private APK and made
  native-quality presentation and touch behavior part of the product value. Web
  feasibility remains true, but is no longer the decision being made.
- Silently broadening an empty `Today` review. The explicit empty state and deliberate
  recovery actions preserve filter truth; automatic broadening would contradict it.
- Holding a sealed Developments edition behind a manual "new edition available" action.
  A newly accepted edition is the current finite document and starts at its top; adding a
  pending-edition state would add clutter and manual refresh reward.
- Adding share-out in v1. It is not inherently harmful, but it does not strengthen the
  bounded reading job enough to justify another action yet.
- Automatically expiring Read Later entries. The seven-slot capacity already prevents
  unbounded accumulation; silent time-based deletion works against intentional saving.

## 11. Current implementation evidence — 18 August 2026

- Flutter formatting and static analysis are clean; all 90 unit, widget, lifecycle,
  migration, security-boundary, accessibility, and golden tests pass locally.
- The existing Sieve website regression suite remains green with all 19 tests passing.
- GitHub Actions independently reproduced formatting, analysis, all Flutter tests, debug
  and release APK builds, and release-signature verification in mobile run
  [`32115572207`](https://github.com/KrE80r/sieve-mobile/actions/runs/32115572207).
  Pages run [`32114484450`](https://github.com/KrE80r/sieve/actions/runs/32114484450)
  passed the 18-test gate and deployed successfully.
- The private `1.1.0` release APK builds with version code `4`, uses the durable local key,
  and verifies with APK Signature Scheme v2 as
  `CN=Sieve Private Android, O=Sieve, C=AU`. The current artifact is `52,262,969` bytes
  with SHA-256
  `0f56ce00b5fd4f892a6f78bffa73ec53cf2209daea0d14578ccb0ccd49eb2d0a`.
- Earlier Android 11 emulator evidence at 1080×2280 and 440 dpi proved first-install
  offline honesty, cached offline restart, independent Read Later persistence, process
  restart, same-key update, timezone change and restoration, and the defined two-step
  Android Back behavior. The current v1-to-v2 SQLite integration test proves legacy
  seven-day saves migrate without loss; installed-device upgrade remains part of the
  physical-phone acceptance gate.
- Emulator evidence is not physical-phone acceptance. Real-device typography, edge and
  control scrolling, browser handoff, frame pacing, lifecycle, and final APK installation
  remain the release gate.

## 12. Go/no-go summary

- **Technical feasibility:** green after the contract safeguards above.
- **Backend compatibility:** green; static GitHub Pages is sufficient.
- **Offline promise:** deliberately absent; local snapshots are resilience and Read Later
  is an online bookmark.
- **Privacy/security:** green for the private APK with the documented third-party image and
  original-site network boundary.
- **Strategic fit:** green only while the app remains a bounded reader, not a content or
  bookmark manager.
- **Flutter choice:** green for the explicitly private Android APK, conditional on the
  physical-device visual and smoothness gate.
- **Product decisions:** resolved, including seven persistent Read Later slots and calm,
  debounced pull checks on remote content only.
- **Remaining acceptance gate:** verify touch, typography, scrolling, lifecycle, and the
  final signed APK on the user's physical phone rather than treating emulator proof as
  device acceptance.
