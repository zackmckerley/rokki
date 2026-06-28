# Rokki — 300 ways to reach top-tier

Companion to `test-matrix-300.md`. That list was correctness ("does X
work?"). This is elevation ("is X world-class?") — polish, depth,
performance, resilience, and product capability. Grouped by theme.

## 1. Micro-interactions & motion (12)
1. Optimistic checkbox/star animate instantly; reconcile silently.
2. Drag ghost + drop-zone highlight with spring easing on panels/rows.
3. Skeleton → content cross-fades as slots stream in (no hard pop).
4. Row hover reveals actions with a subtle slide, not an opacity jump.
5. Dialog open/close: fast scale+fade (120–180ms), reduced-motion aware.
6. Toasts slide/stack/auto-dismiss with a progress bar; swipe to dismiss.
7. Focus ring animates in; never jumps abruptly.
8. Number changes (counts, prices) tween/flash, not instant swap.
9. Ticker pauses on hover AND focus-within.
10. Collapsible sections animate height, not a display:none snap.
11. Buttons show inline spinner + disabled while pending.
12. Route transitions use a consistent fast fade (no white flash).

## 2. Empty / loading / error craft (12)
13. Every list has a purposeful empty state (icon + one action).
14. Skeletons match the real layout's shape (zero reflow on load).
15. Per-card error boundaries (one failing card ≠ blank dashboard).
16. Inline retry on a failed section, not a full reload.
17. Partial failure: show what loaded, flag what didn't.
18. Offline banner with auto-reconnect + queued actions.
19. 404/403/500 pages are on-brand and offer a way back.
20. Slow loads (>Ns) show "still working…", not an infinite spinner.
21. Empty search distinguishes "no results" from "nothing yet".
22. Rollback on optimistic failure explains what reverted (toast).
23. No flash of unstyled/wrong-theme content on first paint.
24. Stale data shows "updated Xs ago / refresh".

## 3. Keyboard & power-user (14)
25. Command palette (⌘K) covers every action + navigation.
26. Palette: fuzzy match, recent, and scoped (this-terminal) results.
27. "?" opens a searchable shortcut cheat sheet.
28. j/k navigate rows, Enter opens, x selects, in task lists.
29. Multi-select (shift/⌘-click) + a bulk-actions bar.
30. Quick-switch terminals/spaces without leaving the keyboard.
31. Every dialog fully keyboard-operable (Enter submit, Esc cancel).
32. "g then d/t/c" go-to navigation.
33. Inline create: type to add a task with no dialog.
34. Undo (⌘Z) for the last destructive/edit action.
35. Focus returns to the trigger after closing menus/dialogs.
36. Arrow-key navigation in the explorer tree.
37. Type-ahead to jump to a row in long lists.
38. F-key bar fully wired + discoverable.

## 4. Performance & perceived speed (14)
39. Prefetch routes on link hover/focus (instant nav).
40. Prefetch likely-next data (hover a task → preload its detail).
41. Virtualize long task lists (render only visible rows).
42. Optimistic writes everywhere; never block on the network.
43. Code-split heavy routes/dialogs; keep the dashboard lean.
44. Enforce LCP/INP/CLS budgets in CI.
45. Image optimization (next/image, AVIF/WebP, right sizes).
46. Self-host + subset fonts; preload; no FOIT/FOUT.
47. Edge-cache safe GETs; stale-while-revalidate.
48. Debounce/throttle realtime-driven refetches.
49. Kill N+1 queries in dashboard/list endpoints.
50. Audit re-render storms; memoize hot paths.
51. Lazy-load below-the-fold cards/ticker.
52. Stays smooth on a throttled mid-tier CPU.

## 5. Onboarding & first-run (12)
53. New-user empty workspace explains space → terminal → task.
54. Optional one-click sample data to explore (and remove).
55. First-run checklist (create terminal, add task, invite, connect cal).
56. Contextual, dismissible tooltips on first encounter.
57. "Connect your calendar" prompt when the Week card is empty.
58. Inline shortcut hints where the action lives.
59. Progressive disclosure of advanced controls.
60. Skippable tour that never re-nags.
61. Zero-terminals state guides creation (no dead buttons).
62. Role/template selection tailors the experience.
63. Tasteful celebration on first task completed.
64. Empty dashboard suggests the next best action.

## 6. Search & filtering depth (12)
65. Global search: tasks, terminals, files, messages, people.
66. Fuzzy + typo-tolerant, ranked results.
67. Operators (terminal:HD101 status:overdue assignee:me).
68. Saved/smart views the user can name + pin.
69. Recent + suggested searches.
70. Highlight matched substrings.
71. Scope toggle: this terminal vs everything.
72. Removable, combinable filter chips.
73. Search-as-you-type with cancellation (no race results).
74. Keyboard-navigable results with previews.
75. Persist last-used filters per surface.
76. "No results" suggests relaxing a filter.

## 7. Notifications & inbox (12)
77. Notification center: read/unread, grouped by terminal/type.
78. Accurate unread badges that clear on view.
79. @mentions notify + deep-link to the exact item.
80. Per-type preferences (in-app/email/none).
81. Opt-in daily/weekly digest email.
82. Snooze / mark-all-read / clear.
83. Realtime toasts for high-signal events only.
84. Deep-links restore full context (scroll + highlight).
85. Mute a terminal/thread.
86. Do-not-disturb / quiet hours.
87. PWA push notifications (opt-in).
88. Searchable notification history.

## 8. Realtime & collaboration (12)
89. Presence avatars (who's viewing a terminal/task).
90. "X is typing…" in comments/messages.
91. Live updates merge without clobbering in-progress edits.
92. Concurrent-edit conflict detection (flag last-write-wins).
93. Optimistic edits reconcile with server truth gracefully.
94. Offline edit queue that syncs on reconnect.
95. "Updated by X just now" attribution on changed rows.
96. Live cursors/selection in shared editors (where applicable).
97. Per-terminal activity feed.
98. Realtime respects permissions (no unauthorized leakage).
99. Clean subscription lifecycle (no leaks/dupes).
100. Reconnect backoff with a visible "reconnecting…" state.

## 9. Mobile / responsive / PWA (12)
101. Installable PWA (manifest, icons, splash, offline shell).
102. Offline read of recently-viewed data.
103. Bottom-sheet dialogs on mobile.
104. ≥44px touch targets everywhere.
105. Swipe gestures (complete/snooze a task).
106. Pull-to-refresh on lists.
107. Safe-area (notch) handling.
108. Responsive tables → cards on narrow widths.
109. Mobile tab bar covers core navigation.
110. Sticky headers that don't eat the small viewport.
111. Landscape + tablet layouts are first-class.
112. Verified on real iOS Safari + Android Chrome.

## 10. Accessibility — AAA aim (12)
113. Full screen-reader pass on each primary flow.
114. Focus moves to main/heading on route change.
115. ARIA live regions announce async updates politely.
116. Every color meaning has a non-color cue.
117. Color-blind-safe palette check.
118. Respect prefers-reduced-motion app-wide.
119. A high-contrast theme (prefers-contrast).
120. OS font-scaling to 200% without breakage.
121. No keyboard traps; logical tab order everywhere.
122. Dialogs aria-modal with labelled title + description.
123. Form errors announced + tied to fields.
124. Skip links + landmarks on every page.

## 11. Data integrity & undo (12)
125. Undo/redo stack for edits + destructive actions.
126. Soft-delete + a Trash with restore.
127. Destructive confirms with specific copy + counts.
128. Autosave drafts (composer/comments) with recovery.
129. Idempotency keys so double-submit doesn't duplicate.
130. Reliable, explained optimistic rollback.
131. Concurrent-edit conflict → merge/choose UI.
132. Task history/versioning (who changed what).
133. Bulk-action confirmation with counts.
134. Data export (CSV/JSON) per terminal/account.
135. Inline, immediate, forgiving validation.
136. Guard against navigating away from unsaved edits.

## 12. Settings & personalization (12)
137. Theme (dark/light/system) + Design-Mode tokens as prefs.
138. Density presets persisted server-side.
139. Multiple named dashboard layouts.
140. Default group/sort/filter per surface.
141. Customizable keyboard shortcuts.
142. Per-terminal defaults (assignee/priority/labels).
143. Profile (name, avatar, timezone, working hours).
144. Centralized notification preferences.
145. Connected-accounts/integrations management.
146. Language/locale + date/number format.
147. Accent-color theming.
148. Settings search.

## 13. Files & attachments (10)
149. Drag-drop anywhere + paste image from clipboard.
150. Upload progress, cancel, retry, resumable for large files.
151. Thumbnails + inline preview (images/PDF/docs).
152. Virus-scan status + safe-quarantine UX.
153. Dedupe identical uploads; version same-name.
154. File search (name + OCR/RAG content).
155. Attach picker with recent files.
156. Bulk download / zip.
157. Per-file permissions + share links with expiry.
158. Storage usage + limits surfaced.

## 14. Tasks & project depth (14)
159. Dependencies (blocks/blocked-by) with cycle detection.
160. Subtask UX: inline add, drag-reorder, progress rollup.
161. Task templates / quick-create presets.
162. Bulk edit on multi-select (status/priority/assignee/labels).
163. Recurring: skip / edit-this-vs-all / end conditions.
164. Natural-language due dates ("next fri 3pm").
165. Time estimates + tracking (actual vs estimate).
166. Board (kanban) view.
167. Timeline/Gantt for dependencies + due dates.
168. Custom fields per terminal/template.
169. Saved task views (My overdue, Blocked, This week).
170. Watchers/followers on a task.
171. Task → calendar event + reminders.
172. Link comment↔task and task↔message.

## 15. Calendar depth (10)
173. Drag to reschedule; resize to change duration.
174. Multiple connected calendars, color-coded.
175. Agenda/day/week/month views.
176. Timezone display ("your time vs theirs").
177. Recurring-event handling (edit this/all).
178. Two-way sync (Google/Outlook) with conflict handling.
179. Create an event inline from the dashboard.
180. Free/busy + conflict warnings.
181. Tasks-with-due overlay toggle.
182. ICS subscribe/export.

## 16. Messaging & comments (10)
183. Threaded replies + collapse.
184. Emoji reactions.
185. @mentions with autocomplete + notification.
186. Markdown + code blocks + link previews.
187. Edit/delete with an edited indicator.
188. Read receipts / seen-by.
189. Slash commands (/task, /assign).
190. Inline attachments + image paste.
191. Unread dividers + jump-to-unread.
192. In-thread search.

## 17. Observability & ops (12)
193. Sentry with source maps, releases, user context.
194. Structured logs (request-id, user, terminal) end-to-end.
195. Real-user web-vitals (INP/LCP/CLS) dashboard.
196. Uptime monitoring + a status page.
197. Alerting on error-rate / latency spikes.
198. Feature flags + kill switches for safe rollout.
199. Audit log (security-relevant actions) with a viewer.
200. Slow-query monitoring.
201. Synthetic checks for login + create-task.
202. Distributed tracing web → API → DB.
203. Health/readiness/liveness endpoints.
204. Cost/usage dashboards (Supabase/Vercel/Upstash).

## 18. Security hardening (14)
205. 2FA / TOTP + recovery codes.
206. Session/device management UI (revoke a device).
207. Rate limiting on auth + write endpoints.
208. CI-enforced RLS test coverage per table.
209. Tighten CSP (no unsafe-inline; nonce/hash).
210. Secret rotation; no secrets in client bundles.
211. SCA/dependency scanning + auto-PRs.
212. CSRF protection on all mutations.
213. Audited input validation + output encoding (XSS).
214. SSO / SAML for enterprise spaces.
215. Per-user MCP tokens with scopes + revocation UX.
216. Account lockout / suspicious-login detection.
217. Encryption at rest + in transit verified.
218. GDPR data export + account deletion.

## 19. Reliability & resilience (12)
219. Retries with backoff + jitter on transient failures.
220. Circuit breakers around flaky externals (calendar/AI).
221. Graceful degradation when realtime/AI is down.
222. Idempotent webhooks + dead-letter queue.
223. Background job queue with retry + visibility.
224. Serverless-tuned DB connection pooling.
225. Backups + tested restore drills.
226. Zero-downtime migrations (expand/contract).
227. Timeouts on every external call.
228. Chaos test: kill realtime/DB, verify UX.
229. Concurrency limits protecting the DB.
230. Fast rollback from a bad deploy.

## 20. AI / MCP product depth (12)
231. AI quick-actions: summarize a terminal, draft an update.
232. Natural-language task create from the palette.
233. Smart scheduling / next-best-action.
234. AI-drafted status updates (edit/approve).
235. Streaming AI responses (token-by-token).
236. Tool-approval UX: clear consent, scope, audit.
237. Per-user token enforcement verified (no service key).
238. AI rate/cost guardrails + quotas surfaced.
239. RAG over the user's files/tasks with citations.
240. "Explain this" / inline AI help.
241. AI never acts destructively without confirmation.
242. Evals to catch AI quality regressions.

## 21. i18n & formatting (8)
243. i18n scaffolding (message catalog; no hardcoded strings).
244. Locale-aware dates/times/numbers/currency.
245. Pluralization + gendered strings.
246. RTL layout support.
247. Per-user timezone correctness everywhere.
248. Live, locale-correct relative time.
249. Tabular figures + grouping for numerics.
250. Translatable email templates.

## 22. Content & copy craft (8)
251. Errors explain what happened + how to fix.
252. Empty-state copy is specific + actionable.
253. Consistent terminology (space/terminal/task) everywhere.
254. Verb-first, unambiguous button microcopy.
255. Tooltips add value, not restate the label.
256. Confirms state the consequence + count.
257. Honest loading copy.
258. Senior-engineer voice (no cute), per the spec.

## 23. Design-system maturity (12)
259. Restore the Tailwind spacing scale (fixes icons/dots/paddings).
260. Storybook with every component state.
261. Audited dark/light token parity.
262. Icon-set consistency (size/weight/source).
263. Elevation/shadow tokens.
264. Z-index scale (no magic numbers).
265. Documented + enforced spacing/type rhythm.
266. De-duplicate reusable primitives.
267. Centralized motion tokens (durations/easings).
268. Consistent focus-state tokens.
269. Density variants as first-class props.
270. Visual snapshot tests for the system.

## 24. Testing & CI maturity (14)
271. Playwright E2E for critical flows (login→task→complete).
272. Visual regression on key screens.
273. RLS/integration tests with a seeded second user.
274. Contract tests for API + MCP parity.
275. Load tests on list/dashboard endpoints.
276. a11y CI (axe) on every page.
277. Meaningful coverage gates.
278. Per-PR preview deploys with seeded data.
279. Lighthouse/web-vitals budget gate.
280. Flaky-test quarantine + tracking.
281. Mutation testing on critical logic.
282. Migration up/down tests in CI.
283. Post-deploy prod smoke test.
284. Test data factories/fixtures.

## 25. Edge cases, delight & differentiation (16)
285. Extremely long titles/labels/emails never break layout.
286. 1000s of tasks stay fast (virtualization).
287. Special chars/emoji/RTL render safely.
288. Deleted-while-viewing handled gracefully.
289. Pagination/infinite-scroll with stable scroll position.
290. Stale-tab → inline re-auth on expiry.
291. The command palette is the hero — fastest path to anything.
292. Keyboard-first speed that feels like a real terminal.
293. Deepen the Bloomberg aesthetic (density, mono numerics, F-keys).
294. "It feels fast" — sub-100ms perceived on every click.
295. Optional, tasteful sound/haptic for key actions.
296. A brand-right loading identity (no generic spinners).
297. Beautiful read-only share views (/r/ pages).
298. Delight: copy-to-clipboard everywhere, smart paste, hover timestamps.
299. Consistency audit — every list/row/dialog follows one pattern.
300. A "what's new" changelog so users feel the product improving.

## 26. Speed — 50 deep-dive optimizations (301–350)
Goes deeper than the headline perf items (#39–52) into specific techniques.

### Rendering & React
301. Push more rendering into Server Components; ship less client JS per route.
302. Move "use client" to the smallest interactive leaves, not whole subtrees.
303. Wrap search/filter in useTransition + useDeferredValue so typing never blocks.
304. Split contexts (theme/density/visibility) so a change re-renders only what's needed.
305. React.memo hot list rows + stable useCallback handlers to stop cascade re-renders.
306. Tune virtualization: fixed row heights + small overscan; don't measure every row.
307. Use GPU-composited transforms/opacity for motion; never animate top/left/width.
308. Batch DOM reads then writes; eliminate layout thrash in drag/resize handlers.
309. Defer non-critical effects to requestIdleCallback (extend the dialog-preload pattern).
310. Strip console/dev-only branches in prod; confirm dead code is tree-shaken.

### Bundle & build
311. Run a bundle analyzer; enforce a per-route first-load JS budget in CI.
312. Modularize icon imports so only used lucide icons ship (not the barrel).
313. Replace heavy deps with lighter/native (date math, lodash, moment-likes).
314. Dynamic-import every dialog/heavy panel (extend the QuickTaskDialog split).
315. Target modern browsers; drop legacy polyfills/transpile weight.
316. Dedupe duplicate transitive deps (one React, one date lib).
317. Defer/async third-party scripts (Sentry, analytics) so they never block first paint.
318. Tune shared-chunk splitting so common code is cached across routes.
319. Minify + Brotli all JS/CSS; verify no unminified prod bundles ship.

### Network & caching
320. `Cache-Control: immutable` + long max-age on hashed static assets.
321. Stale-while-revalidate on safe GET data so repeat views are instant.
322. ISR/`revalidate` on pages whose data tolerates seconds of staleness.
323. Preconnect + dns-prefetch to Supabase, the CDN, and font origins.
324. Verify HTTP/2/3 multiplexing; avoid head-of-line blocking from many requests.
325. Select only the columns/fields each view needs (trim API payloads).
326. Cursor pagination + "load more" instead of fetching everything.
327. Batch independent dashboard queries; remove request waterfalls.
328. Stream slow API responses (extend RSC streaming beyond the page).
329. Edge-cache hot read-only reference data (spaces/terminals lists).
330. Service worker caches the app shell + last-viewed data (offline-fast).
331. Compress + paginate the ticker/activity feed; cap initial rows.

### Data fetching
332. Parallelize independent server fetches (Promise.all); no sequential awaits.
333. Use React `cache()` to dedupe identical fetches within a render.
334. Optimistic cache writes so a successful mutation doesn't trigger a refetch.
335. Patch the single changed row on realtime instead of refetching the list.
336. Prefetch the next likely view's data on hover/focus/viewport-enter.
337. Load the first N rows immediately; stream the remainder in the background.
338. Colocate data fetching with the component that needs it (no top-level over-fetch).

### Database / Supabase
339. Index the hot task-list filters (status, due_date, assignee, terminal_id).
340. Index the columns RLS policies filter on (RLS without an index = full scan).
341. EXPLAIN-analyze the dashboard + calendar queries; kill sequential scans.
342. Materialized view / denormalized counts for dashboard aggregates.
343. Tune Supavisor/PgBouncer pooling for serverless burst concurrency.
344. Add covering indexes so hot reads are index-only.
345. Batch writes (multi-row insert/update) instead of per-row round-trips.
346. Statement timeouts on every query to protect the DB under load.

### Realtime & assets
347. Coalesce realtime bursts; send minimal diffs, not full rows, over the socket.
348. Lazy-subscribe only to visible/active terminals' channels; unsubscribe on blur.
349. Serve responsive AVIF/WebP with srcset; lazy-load all below-the-fold media.
350. Add real-user web-vitals monitoring + a Lighthouse CI gate to catch regressions at the source.
