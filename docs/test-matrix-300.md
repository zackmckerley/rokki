# Rokki — 300-point bug-test matrix

A categorized list of the 300 things worth testing. ~200 are automatable
(Playwright E2E + RLS/integration); the rest are visual/manual or
load/perf checks. Grouped by where bugs actually hide.

## 1. Auth & session (18)
1. Magic-link login lands on the dashboard for an existing user.
2. Magic link for an unknown email gives a neutral "check your inbox" (no account enumeration).
3. Password login with correct creds succeeds.
4. Password login with wrong password errors, no session created.
5. Expired/used magic link shows a clear "link expired" message.
6. Session persists across a full page reload.
7. Session cookie is HttpOnly + Secure + SameSite.
8. Refresh token rotates; an old refresh token can't be replayed.
9. Sign out (current) clears the session and redirects to /login.
10. Sign out of all accounts clears every account in the ring.
11. Add a second account to the ring, then switch between them.
12. Switching accounts lands on the correct home (admin vs dashboard).
13. Switching to an account with zero terminals still loads.
14. Visiting a protected route while logged out redirects to /login with return-to.
15. After login, return-to sends the user to the originally requested page.
16. Signing out in one tab invalidates another tab on its next action.
17. Idle session past expiry forces re-auth on the next request.
18. A cross-site POST to an auth endpoint is rejected (CSRF).

## 2. Dashboard shell & layout (16)
19. Top bar renders wordmark, breadcrumb slot, search, and bell.
20. Clicking the wordmark from /admin goes to /admin, not /.
21. Top-bar search opens the command palette.
22. Ticker tape renders recent activity and scrolls.
23. Ticker "live" dot reflects realtime state (green/amber/grey).
24. Explorer rail shows on desktop, hidden below lg.
25. Resizing the left rail persists across reload.
26. Resizing the right rail persists across reload.
27. Density toggle (cozy/compact) changes spacing app-wide.
28. Focus filter scopes Week/Tasks/Ticker to one terminal.
29. Clearing the focus filter restores all terminals.
30. Greeting (morning/afternoon/evening) renders with no hydration error.
31. Shell + fast cards paint quickly; slow cards stream in.
32. No layout shift when streamed cards arrive.
33. Skip-to-content link focuses the main pane.
34. Back/forward preserves reasonable dashboard state.

## 3. Panels — drag / resize / min / max (18)
35. Drag a panel up/down within its column reorders it.
36. Drag a panel from center to the right column moves it.
37. Drag a panel from right to center moves it.
38. Dragging the last panel out of a column collapses it.
39. With all panels in one column, that column fills the full area.
40. The empty column is a drop target only while dragging.
41. Maximize fills the area and hides the others.
42. Restore returns the panel to its prior size/position.
43. Minimize removes a panel and adds it to the rail Modules list.
44. Reopening a minimized module from the rail restores it.
45. The accent bar in the rail marks open modules only.
46. The splitter between two panels reciprocally adjusts widths.
47. The splitter respects min/max (0.2–0.8) bounds.
48. Layout persists to localStorage and restores on reload.
49. Reset restores the default layout.
50. A newly added panel id is never silently dropped after a schema change.
51. Mobile (<lg) stacks panels; Messages appended under center.
52. Maximize button shows the correct Maximize/Restore aria-label.

## 4. Explorer rail (18)
53. Spaces render with their terminals nested.
54. Collapse/expand a space persists per device.
55. Drag-reorder spaces persists.
56. Drag-reorder terminals within a space persists.
57. Reorder is disabled while filtering.
58. Filter matches space name, terminal name, and slug.
59. Clearing the filter restores the full tree.
60. "/" focuses the filter unless typing elsewhere.
61. Module text aligns with space names (not the arrows).
62. Terminal names indent one level under spaces.
63. SPACES and MODULES headers collapse independently.
64. The settings cog shows only for space owners/admins.
65. Clicking a space navigates to /s/[slug].
66. Clicking a terminal navigates to /p/[slug].
67. Account block shows name, email, admin chip.
68. Account dropdown opens upward and closes on outside click.
69. Long names truncate with ellipsis + title tooltip.
70. "Not in any spaces" empty state renders for a new user.

## 5. Tasks — list & toolbar (22)
71. Auto sort = triage order (incomplete, priority, due, created).
72. Manual sort disabled on the dashboard, enabled in a terminal.
73. Group by Due → Overdue/Today/This week/Later sections.
74. Group by Priority → High/Med/Low.
75. Group by Status → todo/in-progress/blocked/review/done.
76. Group by Terminal sections by terminal.
77. Group by Assignee sections by person.
78. Group by None → flat list.
79. Group choice persists across reload.
80. Section headers collapse/expand and persist.
81. Hide-done removes done tasks and shows the hidden count.
82. Show-done reveals them again.
83. Starred filter shows only starred tasks; toggles back.
84. Starred filter persists across reload.
85. Text filter matches title and terminal name.
86. Filter is case-insensitive.
87. Empty filter shows "no tasks match".
88. Count badge reflects the visible (filtered) count.
89. New task opens the dialog in place (no navigation flash).
90. ⌘N opens the dialog from anywhere on the dashboard.
91. Tasks header height matches Schedule/Messages headers.
92. The two-row toolbar wraps gracefully at narrow widths.

## 6. Task rows (22)
93. Checkbox toggles done optimistically; reconciles on realtime.
94. Toggling done off restores the task.
95. A failed done PATCH rolls back the checkbox.
96. Star toggles; starred rows float to the top.
97. Star persists after reload.
98. Priority left-edge: High=red, Med=amber, else transparent.
99. Due chip shows today/tmr/Nd/Nd-ago/date appropriately.
100. Overdue chip is red; due-soon amber.
101. "Days ago" matches server vs client (no #418 hydration error).
102. Status pill hidden for todo; shown for other statuses.
103. Terminal column right-aligns and aligns across rows.
104. Priority column aligns across rows.
105. Due/late column aligns across rows.
106. Columns stay aligned when a value is missing.
107. Subtask rollup shows done/total when subtasks exist.
108. External-assignee chip shows @+N with an email tooltip.
109. Recurrence chip shows D/W/M with interval.
110. Inline rename: double-click edits, Enter commits, Esc cancels.
111. Single click opens; double-click renames (no double action).
112. Empty rename silently reverts (no destructive blank title).
113. Hover maximize icon opens the task detail.
114. Long titles truncate without breaking the row.

## 7. Task creation dialog (16)
115. Opens via the New task button and ⌘N.
116. Terminal picker lists only the user's terminals.
117. Submitting without a terminal is blocked ("pick a terminal first").
118. Title is required; empty can't submit.
119. Priority selector sets the priority.
120. Due-date picker sets the due date.
121. Assign picker lists terminal members.
122. Labels add/remove works.
123. Repeat sets a recurrence rule.
124. Submit creates the task; it appears in the list.
125. Submit error surfaces a message and keeps the form.
126. Escape closes without creating.
127. Backdrop click closes the dialog.
128. Focus enters the dialog on open; returns to trigger on close.
129. The dialog chunk is preloaded so the first open is instant.
130. Creating from inside a terminal pre-selects that terminal.

## 8. Task detail page (12)
131. /p/[ticker]/task/[seq] loads the task.
132. Editing the title saves.
133. Changing status saves and reflects in the pill.
134. A status update appends to the timeline.
135. Adding a subtask updates the rollup.
136. Reordering subtasks persists.
137. Assign/unassign members works.
138. Adding a comment posts with the author.
139. Uploading an attachment associates it with the task.
140. Deleting the task removes it and redirects.
141. Request-status-update notifies the assignee.
142. Completing a recurring task spawns the next instance.

## 9. Calendar / Schedule (18)
143. Today/Week/Month toggle changes the range.
144. Range choice updates the URL (deep-linkable).
145. Events render under the correct day.
146. Tasks-with-due appear as "due" diamonds.
147. AM/PM stays on the same line as the time (no wrap).
148. The time column stays aligned as the window resizes.
149. Empty days show an em-dash filler.
150. Source filter hides/shows calendars.
151. The "x/y shown" count is correct.
152. Day grouping is timezone-correct (no off-by-one).
153. No hydration mismatch on date labels.
154. Clicking an event with a terminal navigates to it.
155. Month view shows 30 days incl. empty ones.
156. "Your week is clear" empty state renders.
157. Filtered-empty shows "no events match this filter".
158. Events sort by time within a day.
159. All-day vs timed events render distinctly.
160. Long event titles truncate.

## 10. Messages (12)
161. Thread list shows recent conversations + last-touched time.
162. Channel (#) vs DM (@) icons render correctly.
163. Clicking a thread opens /messages.
164. A new realtime message bumps the thread to the top.
165. Relative time ("2m", "1h") renders and updates.
166. "Quiet" empty state renders with an inbox link.
167. Unread indicator reflects unread messages.
168. Minimizing Messages removes the card and rail bar.
169. The thread count badge is correct.
170. Long thread labels truncate.
171. The Messages header aligns with the others.
172. No hydration mismatch on message times.

## 11. Spaces & terminals (16)
173. Only platform admins can create a space.
174. Any space member can create a terminal.
175. Creating a terminal seeds creator + space owners as owners.
176. Terminal slug/ticker is unique and validated.
177. Space settings load for admins.
178. Inviting a member adds them with the chosen role.
179. Changing a role updates permissions.
180. Removing a member revokes access.
181. Non-members can't see a space's terminals.
182. Renaming a space updates rail + breadcrumbs.
183. Deleting a terminal removes its tasks/files from views.
184. Terminal template sets F-keys/metadata correctly.
185. A guest role has read-limited access.
186. A space owner has admin control of every terminal in it.
187. Switching template doesn't leak vertical labels into shared UI.
188. Creating a terminal from the palette pre-selects the space.

## 12. Files (12)
189. Upload a file to a terminal succeeds.
190. Upload shows progress + a virus-scan pending state.
191. A flagged file is quarantined (not downloadable).
192. Download a clean file works.
193. File preview renders for supported types.
194. Delete removes the file from the list.
195. Non-members can't download a terminal's files.
196. An over-limit file is rejected with a clear message.
197. Duplicate filenames disambiguate, not overwrite.
198. RAG indexing status surfaces.
199. A file shows in the task it was attached to.
200. Download URLs aren't guessable across tenants.

## 13. Realtime & sync (14)
201. A task created elsewhere appears without reload.
202. A task updated elsewhere updates in place.
203. A task deleted elsewhere disappears.
204. The ticker shows new activity in real time.
205. A new message arrives without reload.
206. Presence shows who's online.
207. Reconnect after a network drop resumes updates.
208. Blocked websockets fall back to refetch-on-focus.
209. Returning to the tab refetches stale data.
210. Rapid edits debounce dashboard refreshes (no refetch storm).
211. Realtime respects RLS (no cross-tenant leakage).
212. Optimistic update + realtime don't double-apply.
213. Channels clean up on unmount (no leaked subscriptions).
214. The sync dot flips to offline when the browser goes offline.

## 14. Admin console (12)
215. /admin loads only for platform admins.
216. Non-admins are blocked from /admin.
217. The users list paginates/searches.
218. User detail shows roles, spaces, sessions.
219. Webhooks list/create/delete works.
220. The announcement banner publishes to users.
221. The maintenance banner toggles.
222. Admin actions are audit-logged.
223. Exit-admin returns to the dashboard.
224. The console stays user-scoped where RLS requires it.
225. Impersonation (if present) is logged and reversible.
226. The admin sidebar account block works.

## 15. Design Mode — sandbox only (14)
227. The "✦ Design" launcher appears on sandbox, never on rokki.ai.
228. Shift+D toggles the panel.
229. Font-size sliders restyle the app live.
230. Color pickers restyle live.
231. A dark-theme color change does NOT bleed into light.
232. A light-theme change does NOT bleed into dark.
233. Type/layout knobs apply to both themes (shared).
234. Flipping the theme re-initializes the panel inputs.
235. Search filters the knob list.
236. Groups collapse/expand; state persists.
237. "Only changed" shows the current diff.
238. Export copies a per-theme CSS block.
239. Reset-all restores baselines.
240. Tweaks persist per browser and survive reload.

## 16. Accessibility (14)
241. Every interactive control is keyboard reachable; tab order is sane.
242. A visible focus ring on every focusable element.
243. Buttons/links have accessible names.
244. Icons are aria-hidden or labelled.
245. Dialogs trap focus and restore it on close.
246. Escape closes dialogs/menus.
247. Text tiers meet WCAG AA contrast.
248. prefers-reduced-motion disables the ticker/animations.
249. Landmarks (banner/nav/main) present.
250. Form fields have associated labels.
251. Live regions announce realtime updates politely.
252. Checkboxes expose checked/pressed state.
253. Sort tabs expose aria-selected.
254. The skip link works with the keyboard.

## 17. Responsive / mobile (12)
255. <1024px hides the explorer; the tab bar appears.
256. Cards stack vertically on mobile.
257. The tab bar navigates Home/Tasks/etc.
258. Touch targets are adequately sized.
259. The top bar collapses gracefully when narrow.
260. Toolbar controls wrap, not overflow.
261. The calendar time column adjusts on resize.
262. Dialogs are usable on small screens.
263. No horizontal scroll at common widths.
264. Landscape phone layout is usable.
265. Tablet (md) shows a correct intermediate layout.
266. Viewport settings don't break pinch-zoom.

## 18. Performance (10)
267. The dashboard shell paints fast (streamed slots).
268. Low CLS on load.
269. Dialogs/heavy components are code-split.
270. Icons/images don't block first paint.
271. Realtime doesn't trigger excessive re-renders.
272. Filtering a large task list stays responsive.
273. No memory growth over a long session.
274. Bundle size stays within the CI budget.
275. Fonts load without a flash of invisible text.
276. Scrolling a long task list is smooth.

## 19. Security / RLS (14)
277. User A can't read User B's tenant tasks via the API.
278. RLS blocks direct cross-tenant row access.
279. File download is tenant-scoped.
280. Messages are visible only to thread participants.
281. AI/MCP tools run with per-user tokens (no service key).
282. The API rejects requests without a valid session.
283. Inputs are sanitized (no stored XSS in titles/comments).
284. URLs/params never carry sensitive data.
285. Rate limiting throttles abusive requests.
286. CSP headers are present and effective.
287. Auth tokens aren't exposed to client JS.
288. Permission checks are server-side, not just UI-hidden.
289. A revoked member loses access immediately.
290. Admin-only endpoints reject non-admins.

## 20. Errors & edge cases (10)
291. A failed action shows an error, not a silent failure.
292. A 404 page renders for unknown routes.
293. A 403/forbidden page is helpful.
294. Offline mode shows cached content + an offline cue.
295. Very long titles/labels/emails don't break layout.
296. Special characters/emoji in titles render safely.
297. A timezone change recomputes relative dates correctly.
298. Empty states render for every list (tasks/calendar/messages/files).
299. Rapid double-clicks don't create duplicate tasks.
300. No React hydration errors (#418/#425) on any primary page.
