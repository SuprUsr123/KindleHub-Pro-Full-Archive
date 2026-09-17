# KindleHub — Paid-Plan Pricing Ladder (PLAN)

> **Status: PLAN / not implemented.** KindleHub is free today and nothing here changes that. This records the intended subscription ladder for **when** a paid plan is introduced.

## Structure

- **1,600 tiers** = **50 collections** x **32 variants** each.
- Price ladder: starts at **£0.30/month**, rises **£0.05** per tier, ending at **£80.25/month**. `price(n) = £0.30 + £0.05 x (n-1)`.
- Variant order per collection: (base), +, Pro, Pro+, Max, Max+, Ultra, Ultra+, then the two/three-word Pro/Max/Ultra permutations (each with a `+`).
- Collections (cheapest -> dearest): Aurora, Astral, Stellar, Comet, Meteor, Nebula, Pulsar, Quasar, Helix, Prism, Chrome, Carbon, Graphite, Slate, Onyx, Ivory, Amber, Cobalt, Indigo, Crimson, Emerald, Sapphire, Ruby, Diamond, Silver, Copper, Titanium, Neon, Radiant, Lumen, Flux, Synapse, Neural, Logic, Data, Code, Circuit, Binary, Digital, Virtual, Native, Compact, Rapid, Sonic, Rocket, Jet, Aero, Nimbus, Signal, Beacon.

## Open questions (to decide before launch)

- **Feature differentiation:** these are names + prices only. What each tier actually unlocks (storage, AI quota, cosmetics, etc.) is TBD — 1,600 near-identical names will need either a clear feature ladder or a simpler public grouping.
- **Payment provider & billing** (Stripe/etc.), currency handling, VAT, and how existing free users are grandfathered.
- **Backend:** paid entitlements would live on the Cloudflare D1 worker (the app's only backend).

## Full tier list


### Aurora (tiers 1–32)

1. KindleHub Aurora — £0.30/month
2. KindleHub Aurora + — £0.35/month
3. KindleHub Aurora Pro — £0.40/month
4. KindleHub Aurora Pro+ — £0.45/month
5. KindleHub Aurora Max — £0.50/month
6. KindleHub Aurora Max+ — £0.55/month
7. KindleHub Aurora Ultra — £0.60/month
8. KindleHub Aurora Ultra+ — £0.65/month
9. KindleHub Aurora Pro Max — £0.70/month
10. KindleHub Aurora Pro Max+ — £0.75/month
11. KindleHub Aurora Max Pro — £0.80/month
12. KindleHub Aurora Max Pro+ — £0.85/month
13. KindleHub Aurora Pro Ultra — £0.90/month
14. KindleHub Aurora Pro Ultra+ — £0.95/month
15. KindleHub Aurora Ultra Pro — £1.00/month
16. KindleHub Aurora Ultra Pro+ — £1.05/month
17. KindleHub Aurora Max Ultra — £1.10/month
18. KindleHub Aurora Max Ultra+ — £1.15/month
19. KindleHub Aurora Ultra Max — £1.20/month
20. KindleHub Aurora Ultra Max+ — £1.25/month
21. KindleHub Aurora Pro Max Ultra — £1.30/month
22. KindleHub Aurora Pro Max Ultra+ — £1.35/month
23. KindleHub Aurora Pro Ultra Max — £1.40/month
24. KindleHub Aurora Pro Ultra Max+ — £1.45/month
25. KindleHub Aurora Max Pro Ultra — £1.50/month
26. KindleHub Aurora Max Pro Ultra+ — £1.55/month
27. KindleHub Aurora Max Ultra Pro — £1.60/month
28. KindleHub Aurora Max Ultra Pro+ — £1.65/month
29. KindleHub Aurora Ultra Pro Max — £1.70/month
30. KindleHub Aurora Ultra Pro Max+ — £1.75/month
31. KindleHub Aurora Ultra Max Pro — £1.80/month
32. KindleHub Aurora Ultra Max Pro+ — £1.85/month

### Astral (tiers 33–64)

33. KindleHub Astral — £1.90/month
34. KindleHub Astral + — £1.95/month
35. KindleHub Astral Pro — £2.00/month
36. KindleHub Astral Pro+ — £2.05/month
37. KindleHub Astral Max — £2.10/month
38. KindleHub Astral Max+ — £2.15/month
39. KindleHub Astral Ultra — £2.20/month
40. KindleHub Astral Ultra+ — £2.25/month
41. KindleHub Astral Pro Max — £2.30/month
42. KindleHub Astral Pro Max+ — £2.35/month
43. KindleHub Astral Max Pro — £2.40/month
44. KindleHub Astral Max Pro+ — £2.45/month
45. KindleHub Astral Pro Ultra — £2.50/month
46. KindleHub Astral Pro Ultra+ — £2.55/month
47. KindleHub Astral Ultra Pro — £2.60/month
48. KindleHub Astral Ultra Pro+ — £2.65/month
49. KindleHub Astral Max Ultra — £2.70/month
50. KindleHub Astral Max Ultra+ — £2.75/month
51. KindleHub Astral Ultra Max — £2.80/month
52. KindleHub Astral Ultra Max+ — £2.85/month
53. KindleHub Astral Pro Max Ultra — £2.90/month
54. KindleHub Astral Pro Max Ultra+ — £2.95/month
55. KindleHub Astral Pro Ultra Max — £3.00/month
56. KindleHub Astral Pro Ultra Max+ — £3.05/month
57. KindleHub Astral Max Pro Ultra — £3.10/month
58. KindleHub Astral Max Pro Ultra+ — £3.15/month
59. KindleHub Astral Max Ultra Pro — £3.20/month
60. KindleHub Astral Max Ultra Pro+ — £3.25/month
61. KindleHub Astral Ultra Pro Max — £3.30/month
62. KindleHub Astral Ultra Pro Max+ — £3.35/month
63. KindleHub Astral Ultra Max Pro — £3.40/month
64. KindleHub Astral Ultra Max Pro+ — £3.45/month

### Stellar (tiers 65–96)

65. KindleHub Stellar — £3.50/month
66. KindleHub Stellar + — £3.55/month
67. KindleHub Stellar Pro — £3.60/month
68. KindleHub Stellar Pro+ — £3.65/month
69. KindleHub Stellar Max — £3.70/month
70. KindleHub Stellar Max+ — £3.75/month
71. KindleHub Stellar Ultra — £3.80/month
72. KindleHub Stellar Ultra+ — £3.85/month
73. KindleHub Stellar Pro Max — £3.90/month
74. KindleHub Stellar Pro Max+ — £3.95/month
75. KindleHub Stellar Max Pro — £4.00/month
76. KindleHub Stellar Max Pro+ — £4.05/month
77. KindleHub Stellar Pro Ultra — £4.10/month
78. KindleHub Stellar Pro Ultra+ — £4.15/month
79. KindleHub Stellar Ultra Pro — £4.20/month
80. KindleHub Stellar Ultra Pro+ — £4.25/month
81. KindleHub Stellar Max Ultra — £4.30/month
82. KindleHub Stellar Max Ultra+ — £4.35/month
83. KindleHub Stellar Ultra Max — £4.40/month
84. KindleHub Stellar Ultra Max+ — £4.45/month
85. KindleHub Stellar Pro Max Ultra — £4.50/month
86. KindleHub Stellar Pro Max Ultra+ — £4.55/month
87. KindleHub Stellar Pro Ultra Max — £4.60/month
88. KindleHub Stellar Pro Ultra Max+ — £4.65/month
89. KindleHub Stellar Max Pro Ultra — £4.70/month
90. KindleHub Stellar Max Pro Ultra+ — £4.75/month
91. KindleHub Stellar Max Ultra Pro — £4.80/month
92. KindleHub Stellar Max Ultra Pro+ — £4.85/month
93. KindleHub Stellar Ultra Pro Max — £4.90/month
94. KindleHub Stellar Ultra Pro Max+ — £4.95/month
95. KindleHub Stellar Ultra Max Pro — £5.00/month
96. KindleHub Stellar Ultra Max Pro+ — £5.05/month

### Comet (tiers 97–128)

97. KindleHub Comet — £5.10/month
98. KindleHub Comet + — £5.15/month
99. KindleHub Comet Pro — £5.20/month
100. KindleHub Comet Pro+ — £5.25/month
101. KindleHub Comet Max — £5.30/month
102. KindleHub Comet Max+ — £5.35/month
103. KindleHub Comet Ultra — £5.40/month
104. KindleHub Comet Ultra+ — £5.45/month
105. KindleHub Comet Pro Max — £5.50/month
106. KindleHub Comet Pro Max+ — £5.55/month
107. KindleHub Comet Max Pro — £5.60/month
108. KindleHub Comet Max Pro+ — £5.65/month
109. KindleHub Comet Pro Ultra — £5.70/month
110. KindleHub Comet Pro Ultra+ — £5.75/month
111. KindleHub Comet Ultra Pro — £5.80/month
112. KindleHub Comet Ultra Pro+ — £5.85/month
113. KindleHub Comet Max Ultra — £5.90/month
114. KindleHub Comet Max Ultra+ — £5.95/month
115. KindleHub Comet Ultra Max — £6.00/month
116. KindleHub Comet Ultra Max+ — £6.05/month
117. KindleHub Comet Pro Max Ultra — £6.10/month
118. KindleHub Comet Pro Max Ultra+ — £6.15/month
119. KindleHub Comet Pro Ultra Max — £6.20/month
120. KindleHub Comet Pro Ultra Max+ — £6.25/month
121. KindleHub Comet Max Pro Ultra — £6.30/month
122. KindleHub Comet Max Pro Ultra+ — £6.35/month
123. KindleHub Comet Max Ultra Pro — £6.40/month
124. KindleHub Comet Max Ultra Pro+ — £6.45/month
125. KindleHub Comet Ultra Pro Max — £6.50/month
126. KindleHub Comet Ultra Pro Max+ — £6.55/month
127. KindleHub Comet Ultra Max Pro — £6.60/month
128. KindleHub Comet Ultra Max Pro+ — £6.65/month

### Meteor (tiers 129–160)

129. KindleHub Meteor — £6.70/month
130. KindleHub Meteor + — £6.75/month
131. KindleHub Meteor Pro — £6.80/month
132. KindleHub Meteor Pro+ — £6.85/month
133. KindleHub Meteor Max — £6.90/month
134. KindleHub Meteor Max+ — £6.95/month
135. KindleHub Meteor Ultra — £7.00/month
136. KindleHub Meteor Ultra+ — £7.05/month
137. KindleHub Meteor Pro Max — £7.10/month
138. KindleHub Meteor Pro Max+ — £7.15/month
139. KindleHub Meteor Max Pro — £7.20/month
140. KindleHub Meteor Max Pro+ — £7.25/month
141. KindleHub Meteor Pro Ultra — £7.30/month
142. KindleHub Meteor Pro Ultra+ — £7.35/month
143. KindleHub Meteor Ultra Pro — £7.40/month
144. KindleHub Meteor Ultra Pro+ — £7.45/month
145. KindleHub Meteor Max Ultra — £7.50/month
146. KindleHub Meteor Max Ultra+ — £7.55/month
147. KindleHub Meteor Ultra Max — £7.60/month
148. KindleHub Meteor Ultra Max+ — £7.65/month
149. KindleHub Meteor Pro Max Ultra — £7.70/month
150. KindleHub Meteor Pro Max Ultra+ — £7.75/month
151. KindleHub Meteor Pro Ultra Max — £7.80/month
152. KindleHub Meteor Pro Ultra Max+ — £7.85/month
153. KindleHub Meteor Max Pro Ultra — £7.90/month
154. KindleHub Meteor Max Pro Ultra+ — £7.95/month
155. KindleHub Meteor Max Ultra Pro — £8.00/month
156. KindleHub Meteor Max Ultra Pro+ — £8.05/month
157. KindleHub Meteor Ultra Pro Max — £8.10/month
158. KindleHub Meteor Ultra Pro Max+ — £8.15/month
159. KindleHub Meteor Ultra Max Pro — £8.20/month
160. KindleHub Meteor Ultra Max Pro+ — £8.25/month

### Nebula (tiers 161–192)

161. KindleHub Nebula — £8.30/month
162. KindleHub Nebula + — £8.35/month
163. KindleHub Nebula Pro — £8.40/month
164. KindleHub Nebula Pro+ — £8.45/month
165. KindleHub Nebula Max — £8.50/month
166. KindleHub Nebula Max+ — £8.55/month
167. KindleHub Nebula Ultra — £8.60/month
168. KindleHub Nebula Ultra+ — £8.65/month
169. KindleHub Nebula Pro Max — £8.70/month
170. KindleHub Nebula Pro Max+ — £8.75/month
171. KindleHub Nebula Max Pro — £8.80/month
172. KindleHub Nebula Max Pro+ — £8.85/month
173. KindleHub Nebula Pro Ultra — £8.90/month
174. KindleHub Nebula Pro Ultra+ — £8.95/month
175. KindleHub Nebula Ultra Pro — £9.00/month
176. KindleHub Nebula Ultra Pro+ — £9.05/month
177. KindleHub Nebula Max Ultra — £9.10/month
178. KindleHub Nebula Max Ultra+ — £9.15/month
179. KindleHub Nebula Ultra Max — £9.20/month
180. KindleHub Nebula Ultra Max+ — £9.25/month
181. KindleHub Nebula Pro Max Ultra — £9.30/month
182. KindleHub Nebula Pro Max Ultra+ — £9.35/month
183. KindleHub Nebula Pro Ultra Max — £9.40/month
184. KindleHub Nebula Pro Ultra Max+ — £9.45/month
185. KindleHub Nebula Max Pro Ultra — £9.50/month
186. KindleHub Nebula Max Pro Ultra+ — £9.55/month
187. KindleHub Nebula Max Ultra Pro — £9.60/month
188. KindleHub Nebula Max Ultra Pro+ — £9.65/month
189. KindleHub Nebula Ultra Pro Max — £9.70/month
190. KindleHub Nebula Ultra Pro Max+ — £9.75/month
191. KindleHub Nebula Ultra Max Pro — £9.80/month
192. KindleHub Nebula Ultra Max Pro+ — £9.85/month

### Pulsar (tiers 193–224)

193. KindleHub Pulsar — £9.90/month
194. KindleHub Pulsar + — £9.95/month
195. KindleHub Pulsar Pro — £10.00/month
196. KindleHub Pulsar Pro+ — £10.05/month
197. KindleHub Pulsar Max — £10.10/month
198. KindleHub Pulsar Max+ — £10.15/month
199. KindleHub Pulsar Ultra — £10.20/month
200. KindleHub Pulsar Ultra+ — £10.25/month
201. KindleHub Pulsar Pro Max — £10.30/month
202. KindleHub Pulsar Pro Max+ — £10.35/month
203. KindleHub Pulsar Max Pro — £10.40/month
204. KindleHub Pulsar Max Pro+ — £10.45/month
205. KindleHub Pulsar Pro Ultra — £10.50/month
206. KindleHub Pulsar Pro Ultra+ — £10.55/month
207. KindleHub Pulsar Ultra Pro — £10.60/month
208. KindleHub Pulsar Ultra Pro+ — £10.65/month
209. KindleHub Pulsar Max Ultra — £10.70/month
210. KindleHub Pulsar Max Ultra+ — £10.75/month
211. KindleHub Pulsar Ultra Max — £10.80/month
212. KindleHub Pulsar Ultra Max+ — £10.85/month
213. KindleHub Pulsar Pro Max Ultra — £10.90/month
214. KindleHub Pulsar Pro Max Ultra+ — £10.95/month
215. KindleHub Pulsar Pro Ultra Max — £11.00/month
216. KindleHub Pulsar Pro Ultra Max+ — £11.05/month
217. KindleHub Pulsar Max Pro Ultra — £11.10/month
218. KindleHub Pulsar Max Pro Ultra+ — £11.15/month
219. KindleHub Pulsar Max Ultra Pro — £11.20/month
220. KindleHub Pulsar Max Ultra Pro+ — £11.25/month
221. KindleHub Pulsar Ultra Pro Max — £11.30/month
222. KindleHub Pulsar Ultra Pro Max+ — £11.35/month
223. KindleHub Pulsar Ultra Max Pro — £11.40/month
224. KindleHub Pulsar Ultra Max Pro+ — £11.45/month

### Quasar (tiers 225–256)

225. KindleHub Quasar — £11.50/month
226. KindleHub Quasar + — £11.55/month
227. KindleHub Quasar Pro — £11.60/month
228. KindleHub Quasar Pro+ — £11.65/month
229. KindleHub Quasar Max — £11.70/month
230. KindleHub Quasar Max+ — £11.75/month
231. KindleHub Quasar Ultra — £11.80/month
232. KindleHub Quasar Ultra+ — £11.85/month
233. KindleHub Quasar Pro Max — £11.90/month
234. KindleHub Quasar Pro Max+ — £11.95/month
235. KindleHub Quasar Max Pro — £12.00/month
236. KindleHub Quasar Max Pro+ — £12.05/month
237. KindleHub Quasar Pro Ultra — £12.10/month
238. KindleHub Quasar Pro Ultra+ — £12.15/month
239. KindleHub Quasar Ultra Pro — £12.20/month
240. KindleHub Quasar Ultra Pro+ — £12.25/month
241. KindleHub Quasar Max Ultra — £12.30/month
242. KindleHub Quasar Max Ultra+ — £12.35/month
243. KindleHub Quasar Ultra Max — £12.40/month
244. KindleHub Quasar Ultra Max+ — £12.45/month
245. KindleHub Quasar Pro Max Ultra — £12.50/month
246. KindleHub Quasar Pro Max Ultra+ — £12.55/month
247. KindleHub Quasar Pro Ultra Max — £12.60/month
248. KindleHub Quasar Pro Ultra Max+ — £12.65/month
249. KindleHub Quasar Max Pro Ultra — £12.70/month
250. KindleHub Quasar Max Pro Ultra+ — £12.75/month
251. KindleHub Quasar Max Ultra Pro — £12.80/month
252. KindleHub Quasar Max Ultra Pro+ — £12.85/month
253. KindleHub Quasar Ultra Pro Max — £12.90/month
254. KindleHub Quasar Ultra Pro Max+ — £12.95/month
255. KindleHub Quasar Ultra Max Pro — £13.00/month
256. KindleHub Quasar Ultra Max Pro+ — £13.05/month

### Helix (tiers 257–288)

257. KindleHub Helix — £13.10/month
258. KindleHub Helix + — £13.15/month
259. KindleHub Helix Pro — £13.20/month
260. KindleHub Helix Pro+ — £13.25/month
261. KindleHub Helix Max — £13.30/month
262. KindleHub Helix Max+ — £13.35/month
263. KindleHub Helix Ultra — £13.40/month
264. KindleHub Helix Ultra+ — £13.45/month
265. KindleHub Helix Pro Max — £13.50/month
266. KindleHub Helix Pro Max+ — £13.55/month
267. KindleHub Helix Max Pro — £13.60/month
268. KindleHub Helix Max Pro+ — £13.65/month
269. KindleHub Helix Pro Ultra — £13.70/month
270. KindleHub Helix Pro Ultra+ — £13.75/month
271. KindleHub Helix Ultra Pro — £13.80/month
272. KindleHub Helix Ultra Pro+ — £13.85/month
273. KindleHub Helix Max Ultra — £13.90/month
274. KindleHub Helix Max Ultra+ — £13.95/month
275. KindleHub Helix Ultra Max — £14.00/month
276. KindleHub Helix Ultra Max+ — £14.05/month
277. KindleHub Helix Pro Max Ultra — £14.10/month
278. KindleHub Helix Pro Max Ultra+ — £14.15/month
279. KindleHub Helix Pro Ultra Max — £14.20/month
280. KindleHub Helix Pro Ultra Max+ — £14.25/month
281. KindleHub Helix Max Pro Ultra — £14.30/month
282. KindleHub Helix Max Pro Ultra+ — £14.35/month
283. KindleHub Helix Max Ultra Pro — £14.40/month
284. KindleHub Helix Max Ultra Pro+ — £14.45/month
285. KindleHub Helix Ultra Pro Max — £14.50/month
286. KindleHub Helix Ultra Pro Max+ — £14.55/month
287. KindleHub Helix Ultra Max Pro — £14.60/month
288. KindleHub Helix Ultra Max Pro+ — £14.65/month

### Prism (tiers 289–320)

289. KindleHub Prism — £14.70/month
290. KindleHub Prism + — £14.75/month
291. KindleHub Prism Pro — £14.80/month
292. KindleHub Prism Pro+ — £14.85/month
293. KindleHub Prism Max — £14.90/month
294. KindleHub Prism Max+ — £14.95/month
295. KindleHub Prism Ultra — £15.00/month
296. KindleHub Prism Ultra+ — £15.05/month
297. KindleHub Prism Pro Max — £15.10/month
298. KindleHub Prism Pro Max+ — £15.15/month
299. KindleHub Prism Max Pro — £15.20/month
300. KindleHub Prism Max Pro+ — £15.25/month
301. KindleHub Prism Pro Ultra — £15.30/month
302. KindleHub Prism Pro Ultra+ — £15.35/month
303. KindleHub Prism Ultra Pro — £15.40/month
304. KindleHub Prism Ultra Pro+ — £15.45/month
305. KindleHub Prism Max Ultra — £15.50/month
306. KindleHub Prism Max Ultra+ — £15.55/month
307. KindleHub Prism Ultra Max — £15.60/month
308. KindleHub Prism Ultra Max+ — £15.65/month
309. KindleHub Prism Pro Max Ultra — £15.70/month
310. KindleHub Prism Pro Max Ultra+ — £15.75/month
311. KindleHub Prism Pro Ultra Max — £15.80/month
312. KindleHub Prism Pro Ultra Max+ — £15.85/month
313. KindleHub Prism Max Pro Ultra — £15.90/month
314. KindleHub Prism Max Pro Ultra+ — £15.95/month
315. KindleHub Prism Max Ultra Pro — £16.00/month
316. KindleHub Prism Max Ultra Pro+ — £16.05/month
317. KindleHub Prism Ultra Pro Max — £16.10/month
318. KindleHub Prism Ultra Pro Max+ — £16.15/month
319. KindleHub Prism Ultra Max Pro — £16.20/month
320. KindleHub Prism Ultra Max Pro+ — £16.25/month

### Chrome (tiers 321–352)

321. KindleHub Chrome — £16.30/month
322. KindleHub Chrome + — £16.35/month
323. KindleHub Chrome Pro — £16.40/month
324. KindleHub Chrome Pro+ — £16.45/month
325. KindleHub Chrome Max — £16.50/month
326. KindleHub Chrome Max+ — £16.55/month
327. KindleHub Chrome Ultra — £16.60/month
328. KindleHub Chrome Ultra+ — £16.65/month
329. KindleHub Chrome Pro Max — £16.70/month
330. KindleHub Chrome Pro Max+ — £16.75/month
331. KindleHub Chrome Max Pro — £16.80/month
332. KindleHub Chrome Max Pro+ — £16.85/month
333. KindleHub Chrome Pro Ultra — £16.90/month
334. KindleHub Chrome Pro Ultra+ — £16.95/month
335. KindleHub Chrome Ultra Pro — £17.00/month
336. KindleHub Chrome Ultra Pro+ — £17.05/month
337. KindleHub Chrome Max Ultra — £17.10/month
338. KindleHub Chrome Max Ultra+ — £17.15/month
339. KindleHub Chrome Ultra Max — £17.20/month
340. KindleHub Chrome Ultra Max+ — £17.25/month
341. KindleHub Chrome Pro Max Ultra — £17.30/month
342. KindleHub Chrome Pro Max Ultra+ — £17.35/month
343. KindleHub Chrome Pro Ultra Max — £17.40/month
344. KindleHub Chrome Pro Ultra Max+ — £17.45/month
345. KindleHub Chrome Max Pro Ultra — £17.50/month
346. KindleHub Chrome Max Pro Ultra+ — £17.55/month
347. KindleHub Chrome Max Ultra Pro — £17.60/month
348. KindleHub Chrome Max Ultra Pro+ — £17.65/month
349. KindleHub Chrome Ultra Pro Max — £17.70/month
350. KindleHub Chrome Ultra Pro Max+ — £17.75/month
351. KindleHub Chrome Ultra Max Pro — £17.80/month
352. KindleHub Chrome Ultra Max Pro+ — £17.85/month

### Carbon (tiers 353–384)

353. KindleHub Carbon — £17.90/month
354. KindleHub Carbon + — £17.95/month
355. KindleHub Carbon Pro — £18.00/month
356. KindleHub Carbon Pro+ — £18.05/month
357. KindleHub Carbon Max — £18.10/month
358. KindleHub Carbon Max+ — £18.15/month
359. KindleHub Carbon Ultra — £18.20/month
360. KindleHub Carbon Ultra+ — £18.25/month
361. KindleHub Carbon Pro Max — £18.30/month
362. KindleHub Carbon Pro Max+ — £18.35/month
363. KindleHub Carbon Max Pro — £18.40/month
364. KindleHub Carbon Max Pro+ — £18.45/month
365. KindleHub Carbon Pro Ultra — £18.50/month
366. KindleHub Carbon Pro Ultra+ — £18.55/month
367. KindleHub Carbon Ultra Pro — £18.60/month
368. KindleHub Carbon Ultra Pro+ — £18.65/month
369. KindleHub Carbon Max Ultra — £18.70/month
370. KindleHub Carbon Max Ultra+ — £18.75/month
371. KindleHub Carbon Ultra Max — £18.80/month
372. KindleHub Carbon Ultra Max+ — £18.85/month
373. KindleHub Carbon Pro Max Ultra — £18.90/month
374. KindleHub Carbon Pro Max Ultra+ — £18.95/month
375. KindleHub Carbon Pro Ultra Max — £19.00/month
376. KindleHub Carbon Pro Ultra Max+ — £19.05/month
377. KindleHub Carbon Max Pro Ultra — £19.10/month
378. KindleHub Carbon Max Pro Ultra+ — £19.15/month
379. KindleHub Carbon Max Ultra Pro — £19.20/month
380. KindleHub Carbon Max Ultra Pro+ — £19.25/month
381. KindleHub Carbon Ultra Pro Max — £19.30/month
382. KindleHub Carbon Ultra Pro Max+ — £19.35/month
383. KindleHub Carbon Ultra Max Pro — £19.40/month
384. KindleHub Carbon Ultra Max Pro+ — £19.45/month

### Graphite (tiers 385–416)

385. KindleHub Graphite — £19.50/month
386. KindleHub Graphite + — £19.55/month
387. KindleHub Graphite Pro — £19.60/month
388. KindleHub Graphite Pro+ — £19.65/month
389. KindleHub Graphite Max — £19.70/month
390. KindleHub Graphite Max+ — £19.75/month
391. KindleHub Graphite Ultra — £19.80/month
392. KindleHub Graphite Ultra+ — £19.85/month
393. KindleHub Graphite Pro Max — £19.90/month
394. KindleHub Graphite Pro Max+ — £19.95/month
395. KindleHub Graphite Max Pro — £20.00/month
396. KindleHub Graphite Max Pro+ — £20.05/month
397. KindleHub Graphite Pro Ultra — £20.10/month
398. KindleHub Graphite Pro Ultra+ — £20.15/month
399. KindleHub Graphite Ultra Pro — £20.20/month
400. KindleHub Graphite Ultra Pro+ — £20.25/month
401. KindleHub Graphite Max Ultra — £20.30/month
402. KindleHub Graphite Max Ultra+ — £20.35/month
403. KindleHub Graphite Ultra Max — £20.40/month
404. KindleHub Graphite Ultra Max+ — £20.45/month
405. KindleHub Graphite Pro Max Ultra — £20.50/month
406. KindleHub Graphite Pro Max Ultra+ — £20.55/month
407. KindleHub Graphite Pro Ultra Max — £20.60/month
408. KindleHub Graphite Pro Ultra Max+ — £20.65/month
409. KindleHub Graphite Max Pro Ultra — £20.70/month
410. KindleHub Graphite Max Pro Ultra+ — £20.75/month
411. KindleHub Graphite Max Ultra Pro — £20.80/month
412. KindleHub Graphite Max Ultra Pro+ — £20.85/month
413. KindleHub Graphite Ultra Pro Max — £20.90/month
414. KindleHub Graphite Ultra Pro Max+ — £20.95/month
415. KindleHub Graphite Ultra Max Pro — £21.00/month
416. KindleHub Graphite Ultra Max Pro+ — £21.05/month

### Slate (tiers 417–448)

417. KindleHub Slate — £21.10/month
418. KindleHub Slate + — £21.15/month
419. KindleHub Slate Pro — £21.20/month
420. KindleHub Slate Pro+ — £21.25/month
421. KindleHub Slate Max — £21.30/month
422. KindleHub Slate Max+ — £21.35/month
423. KindleHub Slate Ultra — £21.40/month
424. KindleHub Slate Ultra+ — £21.45/month
425. KindleHub Slate Pro Max — £21.50/month
426. KindleHub Slate Pro Max+ — £21.55/month
427. KindleHub Slate Max Pro — £21.60/month
428. KindleHub Slate Max Pro+ — £21.65/month
429. KindleHub Slate Pro Ultra — £21.70/month
430. KindleHub Slate Pro Ultra+ — £21.75/month
431. KindleHub Slate Ultra Pro — £21.80/month
432. KindleHub Slate Ultra Pro+ — £21.85/month
433. KindleHub Slate Max Ultra — £21.90/month
434. KindleHub Slate Max Ultra+ — £21.95/month
435. KindleHub Slate Ultra Max — £22.00/month
436. KindleHub Slate Ultra Max+ — £22.05/month
437. KindleHub Slate Pro Max Ultra — £22.10/month
438. KindleHub Slate Pro Max Ultra+ — £22.15/month
439. KindleHub Slate Pro Ultra Max — £22.20/month
440. KindleHub Slate Pro Ultra Max+ — £22.25/month
441. KindleHub Slate Max Pro Ultra — £22.30/month
442. KindleHub Slate Max Pro Ultra+ — £22.35/month
443. KindleHub Slate Max Ultra Pro — £22.40/month
444. KindleHub Slate Max Ultra Pro+ — £22.45/month
445. KindleHub Slate Ultra Pro Max — £22.50/month
446. KindleHub Slate Ultra Pro Max+ — £22.55/month
447. KindleHub Slate Ultra Max Pro — £22.60/month
448. KindleHub Slate Ultra Max Pro+ — £22.65/month

### Onyx (tiers 449–480)

449. KindleHub Onyx — £22.70/month
450. KindleHub Onyx + — £22.75/month
451. KindleHub Onyx Pro — £22.80/month
452. KindleHub Onyx Pro+ — £22.85/month
453. KindleHub Onyx Max — £22.90/month
454. KindleHub Onyx Max+ — £22.95/month
455. KindleHub Onyx Ultra — £23.00/month
456. KindleHub Onyx Ultra+ — £23.05/month
457. KindleHub Onyx Pro Max — £23.10/month
458. KindleHub Onyx Pro Max+ — £23.15/month
459. KindleHub Onyx Max Pro — £23.20/month
460. KindleHub Onyx Max Pro+ — £23.25/month
461. KindleHub Onyx Pro Ultra — £23.30/month
462. KindleHub Onyx Pro Ultra+ — £23.35/month
463. KindleHub Onyx Ultra Pro — £23.40/month
464. KindleHub Onyx Ultra Pro+ — £23.45/month
465. KindleHub Onyx Max Ultra — £23.50/month
466. KindleHub Onyx Max Ultra+ — £23.55/month
467. KindleHub Onyx Ultra Max — £23.60/month
468. KindleHub Onyx Ultra Max+ — £23.65/month
469. KindleHub Onyx Pro Max Ultra — £23.70/month
470. KindleHub Onyx Pro Max Ultra+ — £23.75/month
471. KindleHub Onyx Pro Ultra Max — £23.80/month
472. KindleHub Onyx Pro Ultra Max+ — £23.85/month
473. KindleHub Onyx Max Pro Ultra — £23.90/month
474. KindleHub Onyx Max Pro Ultra+ — £23.95/month
475. KindleHub Onyx Max Ultra Pro — £24.00/month
476. KindleHub Onyx Max Ultra Pro+ — £24.05/month
477. KindleHub Onyx Ultra Pro Max — £24.10/month
478. KindleHub Onyx Ultra Pro Max+ — £24.15/month
479. KindleHub Onyx Ultra Max Pro — £24.20/month
480. KindleHub Onyx Ultra Max Pro+ — £24.25/month

### Ivory (tiers 481–512)

481. KindleHub Ivory — £24.30/month
482. KindleHub Ivory + — £24.35/month
483. KindleHub Ivory Pro — £24.40/month
484. KindleHub Ivory Pro+ — £24.45/month
485. KindleHub Ivory Max — £24.50/month
486. KindleHub Ivory Max+ — £24.55/month
487. KindleHub Ivory Ultra — £24.60/month
488. KindleHub Ivory Ultra+ — £24.65/month
489. KindleHub Ivory Pro Max — £24.70/month
490. KindleHub Ivory Pro Max+ — £24.75/month
491. KindleHub Ivory Max Pro — £24.80/month
492. KindleHub Ivory Max Pro+ — £24.85/month
493. KindleHub Ivory Pro Ultra — £24.90/month
494. KindleHub Ivory Pro Ultra+ — £24.95/month
495. KindleHub Ivory Ultra Pro — £25.00/month
496. KindleHub Ivory Ultra Pro+ — £25.05/month
497. KindleHub Ivory Max Ultra — £25.10/month
498. KindleHub Ivory Max Ultra+ — £25.15/month
499. KindleHub Ivory Ultra Max — £25.20/month
500. KindleHub Ivory Ultra Max+ — £25.25/month
501. KindleHub Ivory Pro Max Ultra — £25.30/month
502. KindleHub Ivory Pro Max Ultra+ — £25.35/month
503. KindleHub Ivory Pro Ultra Max — £25.40/month
504. KindleHub Ivory Pro Ultra Max+ — £25.45/month
505. KindleHub Ivory Max Pro Ultra — £25.50/month
506. KindleHub Ivory Max Pro Ultra+ — £25.55/month
507. KindleHub Ivory Max Ultra Pro — £25.60/month
508. KindleHub Ivory Max Ultra Pro+ — £25.65/month
509. KindleHub Ivory Ultra Pro Max — £25.70/month
510. KindleHub Ivory Ultra Pro Max+ — £25.75/month
511. KindleHub Ivory Ultra Max Pro — £25.80/month
512. KindleHub Ivory Ultra Max Pro+ — £25.85/month

### Amber (tiers 513–544)

513. KindleHub Amber — £25.90/month
514. KindleHub Amber + — £25.95/month
515. KindleHub Amber Pro — £26.00/month
516. KindleHub Amber Pro+ — £26.05/month
517. KindleHub Amber Max — £26.10/month
518. KindleHub Amber Max+ — £26.15/month
519. KindleHub Amber Ultra — £26.20/month
520. KindleHub Amber Ultra+ — £26.25/month
521. KindleHub Amber Pro Max — £26.30/month
522. KindleHub Amber Pro Max+ — £26.35/month
523. KindleHub Amber Max Pro — £26.40/month
524. KindleHub Amber Max Pro+ — £26.45/month
525. KindleHub Amber Pro Ultra — £26.50/month
526. KindleHub Amber Pro Ultra+ — £26.55/month
527. KindleHub Amber Ultra Pro — £26.60/month
528. KindleHub Amber Ultra Pro+ — £26.65/month
529. KindleHub Amber Max Ultra — £26.70/month
530. KindleHub Amber Max Ultra+ — £26.75/month
531. KindleHub Amber Ultra Max — £26.80/month
532. KindleHub Amber Ultra Max+ — £26.85/month
533. KindleHub Amber Pro Max Ultra — £26.90/month
534. KindleHub Amber Pro Max Ultra+ — £26.95/month
535. KindleHub Amber Pro Ultra Max — £27.00/month
536. KindleHub Amber Pro Ultra Max+ — £27.05/month
537. KindleHub Amber Max Pro Ultra — £27.10/month
538. KindleHub Amber Max Pro Ultra+ — £27.15/month
539. KindleHub Amber Max Ultra Pro — £27.20/month
540. KindleHub Amber Max Ultra Pro+ — £27.25/month
541. KindleHub Amber Ultra Pro Max — £27.30/month
542. KindleHub Amber Ultra Pro Max+ — £27.35/month
543. KindleHub Amber Ultra Max Pro — £27.40/month
544. KindleHub Amber Ultra Max Pro+ — £27.45/month

### Cobalt (tiers 545–576)

545. KindleHub Cobalt — £27.50/month
546. KindleHub Cobalt + — £27.55/month
547. KindleHub Cobalt Pro — £27.60/month
548. KindleHub Cobalt Pro+ — £27.65/month
549. KindleHub Cobalt Max — £27.70/month
550. KindleHub Cobalt Max+ — £27.75/month
551. KindleHub Cobalt Ultra — £27.80/month
552. KindleHub Cobalt Ultra+ — £27.85/month
553. KindleHub Cobalt Pro Max — £27.90/month
554. KindleHub Cobalt Pro Max+ — £27.95/month
555. KindleHub Cobalt Max Pro — £28.00/month
556. KindleHub Cobalt Max Pro+ — £28.05/month
557. KindleHub Cobalt Pro Ultra — £28.10/month
558. KindleHub Cobalt Pro Ultra+ — £28.15/month
559. KindleHub Cobalt Ultra Pro — £28.20/month
560. KindleHub Cobalt Ultra Pro+ — £28.25/month
561. KindleHub Cobalt Max Ultra — £28.30/month
562. KindleHub Cobalt Max Ultra+ — £28.35/month
563. KindleHub Cobalt Ultra Max — £28.40/month
564. KindleHub Cobalt Ultra Max+ — £28.45/month
565. KindleHub Cobalt Pro Max Ultra — £28.50/month
566. KindleHub Cobalt Pro Max Ultra+ — £28.55/month
567. KindleHub Cobalt Pro Ultra Max — £28.60/month
568. KindleHub Cobalt Pro Ultra Max+ — £28.65/month
569. KindleHub Cobalt Max Pro Ultra — £28.70/month
570. KindleHub Cobalt Max Pro Ultra+ — £28.75/month
571. KindleHub Cobalt Max Ultra Pro — £28.80/month
572. KindleHub Cobalt Max Ultra Pro+ — £28.85/month
573. KindleHub Cobalt Ultra Pro Max — £28.90/month
574. KindleHub Cobalt Ultra Pro Max+ — £28.95/month
575. KindleHub Cobalt Ultra Max Pro — £29.00/month
576. KindleHub Cobalt Ultra Max Pro+ — £29.05/month

### Indigo (tiers 577–608)

577. KindleHub Indigo — £29.10/month
578. KindleHub Indigo + — £29.15/month
579. KindleHub Indigo Pro — £29.20/month
580. KindleHub Indigo Pro+ — £29.25/month
581. KindleHub Indigo Max — £29.30/month
582. KindleHub Indigo Max+ — £29.35/month
583. KindleHub Indigo Ultra — £29.40/month
584. KindleHub Indigo Ultra+ — £29.45/month
585. KindleHub Indigo Pro Max — £29.50/month
586. KindleHub Indigo Pro Max+ — £29.55/month
587. KindleHub Indigo Max Pro — £29.60/month
588. KindleHub Indigo Max Pro+ — £29.65/month
589. KindleHub Indigo Pro Ultra — £29.70/month
590. KindleHub Indigo Pro Ultra+ — £29.75/month
591. KindleHub Indigo Ultra Pro — £29.80/month
592. KindleHub Indigo Ultra Pro+ — £29.85/month
593. KindleHub Indigo Max Ultra — £29.90/month
594. KindleHub Indigo Max Ultra+ — £29.95/month
595. KindleHub Indigo Ultra Max — £30.00/month
596. KindleHub Indigo Ultra Max+ — £30.05/month
597. KindleHub Indigo Pro Max Ultra — £30.10/month
598. KindleHub Indigo Pro Max Ultra+ — £30.15/month
599. KindleHub Indigo Pro Ultra Max — £30.20/month
600. KindleHub Indigo Pro Ultra Max+ — £30.25/month
601. KindleHub Indigo Max Pro Ultra — £30.30/month
602. KindleHub Indigo Max Pro Ultra+ — £30.35/month
603. KindleHub Indigo Max Ultra Pro — £30.40/month
604. KindleHub Indigo Max Ultra Pro+ — £30.45/month
605. KindleHub Indigo Ultra Pro Max — £30.50/month
606. KindleHub Indigo Ultra Pro Max+ — £30.55/month
607. KindleHub Indigo Ultra Max Pro — £30.60/month
608. KindleHub Indigo Ultra Max Pro+ — £30.65/month

### Crimson (tiers 609–640)

609. KindleHub Crimson — £30.70/month
610. KindleHub Crimson + — £30.75/month
611. KindleHub Crimson Pro — £30.80/month
612. KindleHub Crimson Pro+ — £30.85/month
613. KindleHub Crimson Max — £30.90/month
614. KindleHub Crimson Max+ — £30.95/month
615. KindleHub Crimson Ultra — £31.00/month
616. KindleHub Crimson Ultra+ — £31.05/month
617. KindleHub Crimson Pro Max — £31.10/month
618. KindleHub Crimson Pro Max+ — £31.15/month
619. KindleHub Crimson Max Pro — £31.20/month
620. KindleHub Crimson Max Pro+ — £31.25/month
621. KindleHub Crimson Pro Ultra — £31.30/month
622. KindleHub Crimson Pro Ultra+ — £31.35/month
623. KindleHub Crimson Ultra Pro — £31.40/month
624. KindleHub Crimson Ultra Pro+ — £31.45/month
625. KindleHub Crimson Max Ultra — £31.50/month
626. KindleHub Crimson Max Ultra+ — £31.55/month
627. KindleHub Crimson Ultra Max — £31.60/month
628. KindleHub Crimson Ultra Max+ — £31.65/month
629. KindleHub Crimson Pro Max Ultra — £31.70/month
630. KindleHub Crimson Pro Max Ultra+ — £31.75/month
631. KindleHub Crimson Pro Ultra Max — £31.80/month
632. KindleHub Crimson Pro Ultra Max+ — £31.85/month
633. KindleHub Crimson Max Pro Ultra — £31.90/month
634. KindleHub Crimson Max Pro Ultra+ — £31.95/month
635. KindleHub Crimson Max Ultra Pro — £32.00/month
636. KindleHub Crimson Max Ultra Pro+ — £32.05/month
637. KindleHub Crimson Ultra Pro Max — £32.10/month
638. KindleHub Crimson Ultra Pro Max+ — £32.15/month
639. KindleHub Crimson Ultra Max Pro — £32.20/month
640. KindleHub Crimson Ultra Max Pro+ — £32.25/month

### Emerald (tiers 641–672)

641. KindleHub Emerald — £32.30/month
642. KindleHub Emerald + — £32.35/month
643. KindleHub Emerald Pro — £32.40/month
644. KindleHub Emerald Pro+ — £32.45/month
645. KindleHub Emerald Max — £32.50/month
646. KindleHub Emerald Max+ — £32.55/month
647. KindleHub Emerald Ultra — £32.60/month
648. KindleHub Emerald Ultra+ — £32.65/month
649. KindleHub Emerald Pro Max — £32.70/month
650. KindleHub Emerald Pro Max+ — £32.75/month
651. KindleHub Emerald Max Pro — £32.80/month
652. KindleHub Emerald Max Pro+ — £32.85/month
653. KindleHub Emerald Pro Ultra — £32.90/month
654. KindleHub Emerald Pro Ultra+ — £32.95/month
655. KindleHub Emerald Ultra Pro — £33.00/month
656. KindleHub Emerald Ultra Pro+ — £33.05/month
657. KindleHub Emerald Max Ultra — £33.10/month
658. KindleHub Emerald Max Ultra+ — £33.15/month
659. KindleHub Emerald Ultra Max — £33.20/month
660. KindleHub Emerald Ultra Max+ — £33.25/month
661. KindleHub Emerald Pro Max Ultra — £33.30/month
662. KindleHub Emerald Pro Max Ultra+ — £33.35/month
663. KindleHub Emerald Pro Ultra Max — £33.40/month
664. KindleHub Emerald Pro Ultra Max+ — £33.45/month
665. KindleHub Emerald Max Pro Ultra — £33.50/month
666. KindleHub Emerald Max Pro Ultra+ — £33.55/month
667. KindleHub Emerald Max Ultra Pro — £33.60/month
668. KindleHub Emerald Max Ultra Pro+ — £33.65/month
669. KindleHub Emerald Ultra Pro Max — £33.70/month
670. KindleHub Emerald Ultra Pro Max+ — £33.75/month
671. KindleHub Emerald Ultra Max Pro — £33.80/month
672. KindleHub Emerald Ultra Max Pro+ — £33.85/month

### Sapphire (tiers 673–704)

673. KindleHub Sapphire — £33.90/month
674. KindleHub Sapphire + — £33.95/month
675. KindleHub Sapphire Pro — £34.00/month
676. KindleHub Sapphire Pro+ — £34.05/month
677. KindleHub Sapphire Max — £34.10/month
678. KindleHub Sapphire Max+ — £34.15/month
679. KindleHub Sapphire Ultra — £34.20/month
680. KindleHub Sapphire Ultra+ — £34.25/month
681. KindleHub Sapphire Pro Max — £34.30/month
682. KindleHub Sapphire Pro Max+ — £34.35/month
683. KindleHub Sapphire Max Pro — £34.40/month
684. KindleHub Sapphire Max Pro+ — £34.45/month
685. KindleHub Sapphire Pro Ultra — £34.50/month
686. KindleHub Sapphire Pro Ultra+ — £34.55/month
687. KindleHub Sapphire Ultra Pro — £34.60/month
688. KindleHub Sapphire Ultra Pro+ — £34.65/month
689. KindleHub Sapphire Max Ultra — £34.70/month
690. KindleHub Sapphire Max Ultra+ — £34.75/month
691. KindleHub Sapphire Ultra Max — £34.80/month
692. KindleHub Sapphire Ultra Max+ — £34.85/month
693. KindleHub Sapphire Pro Max Ultra — £34.90/month
694. KindleHub Sapphire Pro Max Ultra+ — £34.95/month
695. KindleHub Sapphire Pro Ultra Max — £35.00/month
696. KindleHub Sapphire Pro Ultra Max+ — £35.05/month
697. KindleHub Sapphire Max Pro Ultra — £35.10/month
698. KindleHub Sapphire Max Pro Ultra+ — £35.15/month
699. KindleHub Sapphire Max Ultra Pro — £35.20/month
700. KindleHub Sapphire Max Ultra Pro+ — £35.25/month
701. KindleHub Sapphire Ultra Pro Max — £35.30/month
702. KindleHub Sapphire Ultra Pro Max+ — £35.35/month
703. KindleHub Sapphire Ultra Max Pro — £35.40/month
704. KindleHub Sapphire Ultra Max Pro+ — £35.45/month

### Ruby (tiers 705–736)

705. KindleHub Ruby — £35.50/month
706. KindleHub Ruby + — £35.55/month
707. KindleHub Ruby Pro — £35.60/month
708. KindleHub Ruby Pro+ — £35.65/month
709. KindleHub Ruby Max — £35.70/month
710. KindleHub Ruby Max+ — £35.75/month
711. KindleHub Ruby Ultra — £35.80/month
712. KindleHub Ruby Ultra+ — £35.85/month
713. KindleHub Ruby Pro Max — £35.90/month
714. KindleHub Ruby Pro Max+ — £35.95/month
715. KindleHub Ruby Max Pro — £36.00/month
716. KindleHub Ruby Max Pro+ — £36.05/month
717. KindleHub Ruby Pro Ultra — £36.10/month
718. KindleHub Ruby Pro Ultra+ — £36.15/month
719. KindleHub Ruby Ultra Pro — £36.20/month
720. KindleHub Ruby Ultra Pro+ — £36.25/month
721. KindleHub Ruby Max Ultra — £36.30/month
722. KindleHub Ruby Max Ultra+ — £36.35/month
723. KindleHub Ruby Ultra Max — £36.40/month
724. KindleHub Ruby Ultra Max+ — £36.45/month
725. KindleHub Ruby Pro Max Ultra — £36.50/month
726. KindleHub Ruby Pro Max Ultra+ — £36.55/month
727. KindleHub Ruby Pro Ultra Max — £36.60/month
728. KindleHub Ruby Pro Ultra Max+ — £36.65/month
729. KindleHub Ruby Max Pro Ultra — £36.70/month
730. KindleHub Ruby Max Pro Ultra+ — £36.75/month
731. KindleHub Ruby Max Ultra Pro — £36.80/month
732. KindleHub Ruby Max Ultra Pro+ — £36.85/month
733. KindleHub Ruby Ultra Pro Max — £36.90/month
734. KindleHub Ruby Ultra Pro Max+ — £36.95/month
735. KindleHub Ruby Ultra Max Pro — £37.00/month
736. KindleHub Ruby Ultra Max Pro+ — £37.05/month

### Diamond (tiers 737–768)

737. KindleHub Diamond — £37.10/month
738. KindleHub Diamond + — £37.15/month
739. KindleHub Diamond Pro — £37.20/month
740. KindleHub Diamond Pro+ — £37.25/month
741. KindleHub Diamond Max — £37.30/month
742. KindleHub Diamond Max+ — £37.35/month
743. KindleHub Diamond Ultra — £37.40/month
744. KindleHub Diamond Ultra+ — £37.45/month
745. KindleHub Diamond Pro Max — £37.50/month
746. KindleHub Diamond Pro Max+ — £37.55/month
747. KindleHub Diamond Max Pro — £37.60/month
748. KindleHub Diamond Max Pro+ — £37.65/month
749. KindleHub Diamond Pro Ultra — £37.70/month
750. KindleHub Diamond Pro Ultra+ — £37.75/month
751. KindleHub Diamond Ultra Pro — £37.80/month
752. KindleHub Diamond Ultra Pro+ — £37.85/month
753. KindleHub Diamond Max Ultra — £37.90/month
754. KindleHub Diamond Max Ultra+ — £37.95/month
755. KindleHub Diamond Ultra Max — £38.00/month
756. KindleHub Diamond Ultra Max+ — £38.05/month
757. KindleHub Diamond Pro Max Ultra — £38.10/month
758. KindleHub Diamond Pro Max Ultra+ — £38.15/month
759. KindleHub Diamond Pro Ultra Max — £38.20/month
760. KindleHub Diamond Pro Ultra Max+ — £38.25/month
761. KindleHub Diamond Max Pro Ultra — £38.30/month
762. KindleHub Diamond Max Pro Ultra+ — £38.35/month
763. KindleHub Diamond Max Ultra Pro — £38.40/month
764. KindleHub Diamond Max Ultra Pro+ — £38.45/month
765. KindleHub Diamond Ultra Pro Max — £38.50/month
766. KindleHub Diamond Ultra Pro Max+ — £38.55/month
767. KindleHub Diamond Ultra Max Pro — £38.60/month
768. KindleHub Diamond Ultra Max Pro+ — £38.65/month

### Silver (tiers 769–800)

769. KindleHub Silver — £38.70/month
770. KindleHub Silver + — £38.75/month
771. KindleHub Silver Pro — £38.80/month
772. KindleHub Silver Pro+ — £38.85/month
773. KindleHub Silver Max — £38.90/month
774. KindleHub Silver Max+ — £38.95/month
775. KindleHub Silver Ultra — £39.00/month
776. KindleHub Silver Ultra+ — £39.05/month
777. KindleHub Silver Pro Max — £39.10/month
778. KindleHub Silver Pro Max+ — £39.15/month
779. KindleHub Silver Max Pro — £39.20/month
780. KindleHub Silver Max Pro+ — £39.25/month
781. KindleHub Silver Pro Ultra — £39.30/month
782. KindleHub Silver Pro Ultra+ — £39.35/month
783. KindleHub Silver Ultra Pro — £39.40/month
784. KindleHub Silver Ultra Pro+ — £39.45/month
785. KindleHub Silver Max Ultra — £39.50/month
786. KindleHub Silver Max Ultra+ — £39.55/month
787. KindleHub Silver Ultra Max — £39.60/month
788. KindleHub Silver Ultra Max+ — £39.65/month
789. KindleHub Silver Pro Max Ultra — £39.70/month
790. KindleHub Silver Pro Max Ultra+ — £39.75/month
791. KindleHub Silver Pro Ultra Max — £39.80/month
792. KindleHub Silver Pro Ultra Max+ — £39.85/month
793. KindleHub Silver Max Pro Ultra — £39.90/month
794. KindleHub Silver Max Pro Ultra+ — £39.95/month
795. KindleHub Silver Max Ultra Pro — £40.00/month
796. KindleHub Silver Max Ultra Pro+ — £40.05/month
797. KindleHub Silver Ultra Pro Max — £40.10/month
798. KindleHub Silver Ultra Pro Max+ — £40.15/month
799. KindleHub Silver Ultra Max Pro — £40.20/month
800. KindleHub Silver Ultra Max Pro+ — £40.25/month

### Copper (tiers 801–832)

801. KindleHub Copper — £40.30/month
802. KindleHub Copper + — £40.35/month
803. KindleHub Copper Pro — £40.40/month
804. KindleHub Copper Pro+ — £40.45/month
805. KindleHub Copper Max — £40.50/month
806. KindleHub Copper Max+ — £40.55/month
807. KindleHub Copper Ultra — £40.60/month
808. KindleHub Copper Ultra+ — £40.65/month
809. KindleHub Copper Pro Max — £40.70/month
810. KindleHub Copper Pro Max+ — £40.75/month
811. KindleHub Copper Max Pro — £40.80/month
812. KindleHub Copper Max Pro+ — £40.85/month
813. KindleHub Copper Pro Ultra — £40.90/month
814. KindleHub Copper Pro Ultra+ — £40.95/month
815. KindleHub Copper Ultra Pro — £41.00/month
816. KindleHub Copper Ultra Pro+ — £41.05/month
817. KindleHub Copper Max Ultra — £41.10/month
818. KindleHub Copper Max Ultra+ — £41.15/month
819. KindleHub Copper Ultra Max — £41.20/month
820. KindleHub Copper Ultra Max+ — £41.25/month
821. KindleHub Copper Pro Max Ultra — £41.30/month
822. KindleHub Copper Pro Max Ultra+ — £41.35/month
823. KindleHub Copper Pro Ultra Max — £41.40/month
824. KindleHub Copper Pro Ultra Max+ — £41.45/month
825. KindleHub Copper Max Pro Ultra — £41.50/month
826. KindleHub Copper Max Pro Ultra+ — £41.55/month
827. KindleHub Copper Max Ultra Pro — £41.60/month
828. KindleHub Copper Max Ultra Pro+ — £41.65/month
829. KindleHub Copper Ultra Pro Max — £41.70/month
830. KindleHub Copper Ultra Pro Max+ — £41.75/month
831. KindleHub Copper Ultra Max Pro — £41.80/month
832. KindleHub Copper Ultra Max Pro+ — £41.85/month

### Titanium (tiers 833–864)

833. KindleHub Titanium — £41.90/month
834. KindleHub Titanium + — £41.95/month
835. KindleHub Titanium Pro — £42.00/month
836. KindleHub Titanium Pro+ — £42.05/month
837. KindleHub Titanium Max — £42.10/month
838. KindleHub Titanium Max+ — £42.15/month
839. KindleHub Titanium Ultra — £42.20/month
840. KindleHub Titanium Ultra+ — £42.25/month
841. KindleHub Titanium Pro Max — £42.30/month
842. KindleHub Titanium Pro Max+ — £42.35/month
843. KindleHub Titanium Max Pro — £42.40/month
844. KindleHub Titanium Max Pro+ — £42.45/month
845. KindleHub Titanium Pro Ultra — £42.50/month
846. KindleHub Titanium Pro Ultra+ — £42.55/month
847. KindleHub Titanium Ultra Pro — £42.60/month
848. KindleHub Titanium Ultra Pro+ — £42.65/month
849. KindleHub Titanium Max Ultra — £42.70/month
850. KindleHub Titanium Max Ultra+ — £42.75/month
851. KindleHub Titanium Ultra Max — £42.80/month
852. KindleHub Titanium Ultra Max+ — £42.85/month
853. KindleHub Titanium Pro Max Ultra — £42.90/month
854. KindleHub Titanium Pro Max Ultra+ — £42.95/month
855. KindleHub Titanium Pro Ultra Max — £43.00/month
856. KindleHub Titanium Pro Ultra Max+ — £43.05/month
857. KindleHub Titanium Max Pro Ultra — £43.10/month
858. KindleHub Titanium Max Pro Ultra+ — £43.15/month
859. KindleHub Titanium Max Ultra Pro — £43.20/month
860. KindleHub Titanium Max Ultra Pro+ — £43.25/month
861. KindleHub Titanium Ultra Pro Max — £43.30/month
862. KindleHub Titanium Ultra Pro Max+ — £43.35/month
863. KindleHub Titanium Ultra Max Pro — £43.40/month
864. KindleHub Titanium Ultra Max Pro+ — £43.45/month

### Neon (tiers 865–896)

865. KindleHub Neon — £43.50/month
866. KindleHub Neon + — £43.55/month
867. KindleHub Neon Pro — £43.60/month
868. KindleHub Neon Pro+ — £43.65/month
869. KindleHub Neon Max — £43.70/month
870. KindleHub Neon Max+ — £43.75/month
871. KindleHub Neon Ultra — £43.80/month
872. KindleHub Neon Ultra+ — £43.85/month
873. KindleHub Neon Pro Max — £43.90/month
874. KindleHub Neon Pro Max+ — £43.95/month
875. KindleHub Neon Max Pro — £44.00/month
876. KindleHub Neon Max Pro+ — £44.05/month
877. KindleHub Neon Pro Ultra — £44.10/month
878. KindleHub Neon Pro Ultra+ — £44.15/month
879. KindleHub Neon Ultra Pro — £44.20/month
880. KindleHub Neon Ultra Pro+ — £44.25/month
881. KindleHub Neon Max Ultra — £44.30/month
882. KindleHub Neon Max Ultra+ — £44.35/month
883. KindleHub Neon Ultra Max — £44.40/month
884. KindleHub Neon Ultra Max+ — £44.45/month
885. KindleHub Neon Pro Max Ultra — £44.50/month
886. KindleHub Neon Pro Max Ultra+ — £44.55/month
887. KindleHub Neon Pro Ultra Max — £44.60/month
888. KindleHub Neon Pro Ultra Max+ — £44.65/month
889. KindleHub Neon Max Pro Ultra — £44.70/month
890. KindleHub Neon Max Pro Ultra+ — £44.75/month
891. KindleHub Neon Max Ultra Pro — £44.80/month
892. KindleHub Neon Max Ultra Pro+ — £44.85/month
893. KindleHub Neon Ultra Pro Max — £44.90/month
894. KindleHub Neon Ultra Pro Max+ — £44.95/month
895. KindleHub Neon Ultra Max Pro — £45.00/month
896. KindleHub Neon Ultra Max Pro+ — £45.05/month

### Radiant (tiers 897–928)

897. KindleHub Radiant — £45.10/month
898. KindleHub Radiant + — £45.15/month
899. KindleHub Radiant Pro — £45.20/month
900. KindleHub Radiant Pro+ — £45.25/month
901. KindleHub Radiant Max — £45.30/month
902. KindleHub Radiant Max+ — £45.35/month
903. KindleHub Radiant Ultra — £45.40/month
904. KindleHub Radiant Ultra+ — £45.45/month
905. KindleHub Radiant Pro Max — £45.50/month
906. KindleHub Radiant Pro Max+ — £45.55/month
907. KindleHub Radiant Max Pro — £45.60/month
908. KindleHub Radiant Max Pro+ — £45.65/month
909. KindleHub Radiant Pro Ultra — £45.70/month
910. KindleHub Radiant Pro Ultra+ — £45.75/month
911. KindleHub Radiant Ultra Pro — £45.80/month
912. KindleHub Radiant Ultra Pro+ — £45.85/month
913. KindleHub Radiant Max Ultra — £45.90/month
914. KindleHub Radiant Max Ultra+ — £45.95/month
915. KindleHub Radiant Ultra Max — £46.00/month
916. KindleHub Radiant Ultra Max+ — £46.05/month
917. KindleHub Radiant Pro Max Ultra — £46.10/month
918. KindleHub Radiant Pro Max Ultra+ — £46.15/month
919. KindleHub Radiant Pro Ultra Max — £46.20/month
920. KindleHub Radiant Pro Ultra Max+ — £46.25/month
921. KindleHub Radiant Max Pro Ultra — £46.30/month
922. KindleHub Radiant Max Pro Ultra+ — £46.35/month
923. KindleHub Radiant Max Ultra Pro — £46.40/month
924. KindleHub Radiant Max Ultra Pro+ — £46.45/month
925. KindleHub Radiant Ultra Pro Max — £46.50/month
926. KindleHub Radiant Ultra Pro Max+ — £46.55/month
927. KindleHub Radiant Ultra Max Pro — £46.60/month
928. KindleHub Radiant Ultra Max Pro+ — £46.65/month

### Lumen (tiers 929–960)

929. KindleHub Lumen — £46.70/month
930. KindleHub Lumen + — £46.75/month
931. KindleHub Lumen Pro — £46.80/month
932. KindleHub Lumen Pro+ — £46.85/month
933. KindleHub Lumen Max — £46.90/month
934. KindleHub Lumen Max+ — £46.95/month
935. KindleHub Lumen Ultra — £47.00/month
936. KindleHub Lumen Ultra+ — £47.05/month
937. KindleHub Lumen Pro Max — £47.10/month
938. KindleHub Lumen Pro Max+ — £47.15/month
939. KindleHub Lumen Max Pro — £47.20/month
940. KindleHub Lumen Max Pro+ — £47.25/month
941. KindleHub Lumen Pro Ultra — £47.30/month
942. KindleHub Lumen Pro Ultra+ — £47.35/month
943. KindleHub Lumen Ultra Pro — £47.40/month
944. KindleHub Lumen Ultra Pro+ — £47.45/month
945. KindleHub Lumen Max Ultra — £47.50/month
946. KindleHub Lumen Max Ultra+ — £47.55/month
947. KindleHub Lumen Ultra Max — £47.60/month
948. KindleHub Lumen Ultra Max+ — £47.65/month
949. KindleHub Lumen Pro Max Ultra — £47.70/month
950. KindleHub Lumen Pro Max Ultra+ — £47.75/month
951. KindleHub Lumen Pro Ultra Max — £47.80/month
952. KindleHub Lumen Pro Ultra Max+ — £47.85/month
953. KindleHub Lumen Max Pro Ultra — £47.90/month
954. KindleHub Lumen Max Pro Ultra+ — £47.95/month
955. KindleHub Lumen Max Ultra Pro — £48.00/month
956. KindleHub Lumen Max Ultra Pro+ — £48.05/month
957. KindleHub Lumen Ultra Pro Max — £48.10/month
958. KindleHub Lumen Ultra Pro Max+ — £48.15/month
959. KindleHub Lumen Ultra Max Pro — £48.20/month
960. KindleHub Lumen Ultra Max Pro+ — £48.25/month

### Flux (tiers 961–992)

961. KindleHub Flux — £48.30/month
962. KindleHub Flux + — £48.35/month
963. KindleHub Flux Pro — £48.40/month
964. KindleHub Flux Pro+ — £48.45/month
965. KindleHub Flux Max — £48.50/month
966. KindleHub Flux Max+ — £48.55/month
967. KindleHub Flux Ultra — £48.60/month
968. KindleHub Flux Ultra+ — £48.65/month
969. KindleHub Flux Pro Max — £48.70/month
970. KindleHub Flux Pro Max+ — £48.75/month
971. KindleHub Flux Max Pro — £48.80/month
972. KindleHub Flux Max Pro+ — £48.85/month
973. KindleHub Flux Pro Ultra — £48.90/month
974. KindleHub Flux Pro Ultra+ — £48.95/month
975. KindleHub Flux Ultra Pro — £49.00/month
976. KindleHub Flux Ultra Pro+ — £49.05/month
977. KindleHub Flux Max Ultra — £49.10/month
978. KindleHub Flux Max Ultra+ — £49.15/month
979. KindleHub Flux Ultra Max — £49.20/month
980. KindleHub Flux Ultra Max+ — £49.25/month
981. KindleHub Flux Pro Max Ultra — £49.30/month
982. KindleHub Flux Pro Max Ultra+ — £49.35/month
983. KindleHub Flux Pro Ultra Max — £49.40/month
984. KindleHub Flux Pro Ultra Max+ — £49.45/month
985. KindleHub Flux Max Pro Ultra — £49.50/month
986. KindleHub Flux Max Pro Ultra+ — £49.55/month
987. KindleHub Flux Max Ultra Pro — £49.60/month
988. KindleHub Flux Max Ultra Pro+ — £49.65/month
989. KindleHub Flux Ultra Pro Max — £49.70/month
990. KindleHub Flux Ultra Pro Max+ — £49.75/month
991. KindleHub Flux Ultra Max Pro — £49.80/month
992. KindleHub Flux Ultra Max Pro+ — £49.85/month

### Synapse (tiers 993–1024)

993. KindleHub Synapse — £49.90/month
994. KindleHub Synapse + — £49.95/month
995. KindleHub Synapse Pro — £50.00/month
996. KindleHub Synapse Pro+ — £50.05/month
997. KindleHub Synapse Max — £50.10/month
998. KindleHub Synapse Max+ — £50.15/month
999. KindleHub Synapse Ultra — £50.20/month
1000. KindleHub Synapse Ultra+ — £50.25/month
1001. KindleHub Synapse Pro Max — £50.30/month
1002. KindleHub Synapse Pro Max+ — £50.35/month
1003. KindleHub Synapse Max Pro — £50.40/month
1004. KindleHub Synapse Max Pro+ — £50.45/month
1005. KindleHub Synapse Pro Ultra — £50.50/month
1006. KindleHub Synapse Pro Ultra+ — £50.55/month
1007. KindleHub Synapse Ultra Pro — £50.60/month
1008. KindleHub Synapse Ultra Pro+ — £50.65/month
1009. KindleHub Synapse Max Ultra — £50.70/month
1010. KindleHub Synapse Max Ultra+ — £50.75/month
1011. KindleHub Synapse Ultra Max — £50.80/month
1012. KindleHub Synapse Ultra Max+ — £50.85/month
1013. KindleHub Synapse Pro Max Ultra — £50.90/month
1014. KindleHub Synapse Pro Max Ultra+ — £50.95/month
1015. KindleHub Synapse Pro Ultra Max — £51.00/month
1016. KindleHub Synapse Pro Ultra Max+ — £51.05/month
1017. KindleHub Synapse Max Pro Ultra — £51.10/month
1018. KindleHub Synapse Max Pro Ultra+ — £51.15/month
1019. KindleHub Synapse Max Ultra Pro — £51.20/month
1020. KindleHub Synapse Max Ultra Pro+ — £51.25/month
1021. KindleHub Synapse Ultra Pro Max — £51.30/month
1022. KindleHub Synapse Ultra Pro Max+ — £51.35/month
1023. KindleHub Synapse Ultra Max Pro — £51.40/month
1024. KindleHub Synapse Ultra Max Pro+ — £51.45/month

### Neural (tiers 1025–1056)

1025. KindleHub Neural — £51.50/month
1026. KindleHub Neural + — £51.55/month
1027. KindleHub Neural Pro — £51.60/month
1028. KindleHub Neural Pro+ — £51.65/month
1029. KindleHub Neural Max — £51.70/month
1030. KindleHub Neural Max+ — £51.75/month
1031. KindleHub Neural Ultra — £51.80/month
1032. KindleHub Neural Ultra+ — £51.85/month
1033. KindleHub Neural Pro Max — £51.90/month
1034. KindleHub Neural Pro Max+ — £51.95/month
1035. KindleHub Neural Max Pro — £52.00/month
1036. KindleHub Neural Max Pro+ — £52.05/month
1037. KindleHub Neural Pro Ultra — £52.10/month
1038. KindleHub Neural Pro Ultra+ — £52.15/month
1039. KindleHub Neural Ultra Pro — £52.20/month
1040. KindleHub Neural Ultra Pro+ — £52.25/month
1041. KindleHub Neural Max Ultra — £52.30/month
1042. KindleHub Neural Max Ultra+ — £52.35/month
1043. KindleHub Neural Ultra Max — £52.40/month
1044. KindleHub Neural Ultra Max+ — £52.45/month
1045. KindleHub Neural Pro Max Ultra — £52.50/month
1046. KindleHub Neural Pro Max Ultra+ — £52.55/month
1047. KindleHub Neural Pro Ultra Max — £52.60/month
1048. KindleHub Neural Pro Ultra Max+ — £52.65/month
1049. KindleHub Neural Max Pro Ultra — £52.70/month
1050. KindleHub Neural Max Pro Ultra+ — £52.75/month
1051. KindleHub Neural Max Ultra Pro — £52.80/month
1052. KindleHub Neural Max Ultra Pro+ — £52.85/month
1053. KindleHub Neural Ultra Pro Max — £52.90/month
1054. KindleHub Neural Ultra Pro Max+ — £52.95/month
1055. KindleHub Neural Ultra Max Pro — £53.00/month
1056. KindleHub Neural Ultra Max Pro+ — £53.05/month

### Logic (tiers 1057–1088)

1057. KindleHub Logic — £53.10/month
1058. KindleHub Logic + — £53.15/month
1059. KindleHub Logic Pro — £53.20/month
1060. KindleHub Logic Pro+ — £53.25/month
1061. KindleHub Logic Max — £53.30/month
1062. KindleHub Logic Max+ — £53.35/month
1063. KindleHub Logic Ultra — £53.40/month
1064. KindleHub Logic Ultra+ — £53.45/month
1065. KindleHub Logic Pro Max — £53.50/month
1066. KindleHub Logic Pro Max+ — £53.55/month
1067. KindleHub Logic Max Pro — £53.60/month
1068. KindleHub Logic Max Pro+ — £53.65/month
1069. KindleHub Logic Pro Ultra — £53.70/month
1070. KindleHub Logic Pro Ultra+ — £53.75/month
1071. KindleHub Logic Ultra Pro — £53.80/month
1072. KindleHub Logic Ultra Pro+ — £53.85/month
1073. KindleHub Logic Max Ultra — £53.90/month
1074. KindleHub Logic Max Ultra+ — £53.95/month
1075. KindleHub Logic Ultra Max — £54.00/month
1076. KindleHub Logic Ultra Max+ — £54.05/month
1077. KindleHub Logic Pro Max Ultra — £54.10/month
1078. KindleHub Logic Pro Max Ultra+ — £54.15/month
1079. KindleHub Logic Pro Ultra Max — £54.20/month
1080. KindleHub Logic Pro Ultra Max+ — £54.25/month
1081. KindleHub Logic Max Pro Ultra — £54.30/month
1082. KindleHub Logic Max Pro Ultra+ — £54.35/month
1083. KindleHub Logic Max Ultra Pro — £54.40/month
1084. KindleHub Logic Max Ultra Pro+ — £54.45/month
1085. KindleHub Logic Ultra Pro Max — £54.50/month
1086. KindleHub Logic Ultra Pro Max+ — £54.55/month
1087. KindleHub Logic Ultra Max Pro — £54.60/month
1088. KindleHub Logic Ultra Max Pro+ — £54.65/month

### Data (tiers 1089–1120)

1089. KindleHub Data — £54.70/month
1090. KindleHub Data + — £54.75/month
1091. KindleHub Data Pro — £54.80/month
1092. KindleHub Data Pro+ — £54.85/month
1093. KindleHub Data Max — £54.90/month
1094. KindleHub Data Max+ — £54.95/month
1095. KindleHub Data Ultra — £55.00/month
1096. KindleHub Data Ultra+ — £55.05/month
1097. KindleHub Data Pro Max — £55.10/month
1098. KindleHub Data Pro Max+ — £55.15/month
1099. KindleHub Data Max Pro — £55.20/month
1100. KindleHub Data Max Pro+ — £55.25/month
1101. KindleHub Data Pro Ultra — £55.30/month
1102. KindleHub Data Pro Ultra+ — £55.35/month
1103. KindleHub Data Ultra Pro — £55.40/month
1104. KindleHub Data Ultra Pro+ — £55.45/month
1105. KindleHub Data Max Ultra — £55.50/month
1106. KindleHub Data Max Ultra+ — £55.55/month
1107. KindleHub Data Ultra Max — £55.60/month
1108. KindleHub Data Ultra Max+ — £55.65/month
1109. KindleHub Data Pro Max Ultra — £55.70/month
1110. KindleHub Data Pro Max Ultra+ — £55.75/month
1111. KindleHub Data Pro Ultra Max — £55.80/month
1112. KindleHub Data Pro Ultra Max+ — £55.85/month
1113. KindleHub Data Max Pro Ultra — £55.90/month
1114. KindleHub Data Max Pro Ultra+ — £55.95/month
1115. KindleHub Data Max Ultra Pro — £56.00/month
1116. KindleHub Data Max Ultra Pro+ — £56.05/month
1117. KindleHub Data Ultra Pro Max — £56.10/month
1118. KindleHub Data Ultra Pro Max+ — £56.15/month
1119. KindleHub Data Ultra Max Pro — £56.20/month
1120. KindleHub Data Ultra Max Pro+ — £56.25/month

### Code (tiers 1121–1152)

1121. KindleHub Code — £56.30/month
1122. KindleHub Code + — £56.35/month
1123. KindleHub Code Pro — £56.40/month
1124. KindleHub Code Pro+ — £56.45/month
1125. KindleHub Code Max — £56.50/month
1126. KindleHub Code Max+ — £56.55/month
1127. KindleHub Code Ultra — £56.60/month
1128. KindleHub Code Ultra+ — £56.65/month
1129. KindleHub Code Pro Max — £56.70/month
1130. KindleHub Code Pro Max+ — £56.75/month
1131. KindleHub Code Max Pro — £56.80/month
1132. KindleHub Code Max Pro+ — £56.85/month
1133. KindleHub Code Pro Ultra — £56.90/month
1134. KindleHub Code Pro Ultra+ — £56.95/month
1135. KindleHub Code Ultra Pro — £57.00/month
1136. KindleHub Code Ultra Pro+ — £57.05/month
1137. KindleHub Code Max Ultra — £57.10/month
1138. KindleHub Code Max Ultra+ — £57.15/month
1139. KindleHub Code Ultra Max — £57.20/month
1140. KindleHub Code Ultra Max+ — £57.25/month
1141. KindleHub Code Pro Max Ultra — £57.30/month
1142. KindleHub Code Pro Max Ultra+ — £57.35/month
1143. KindleHub Code Pro Ultra Max — £57.40/month
1144. KindleHub Code Pro Ultra Max+ — £57.45/month
1145. KindleHub Code Max Pro Ultra — £57.50/month
1146. KindleHub Code Max Pro Ultra+ — £57.55/month
1147. KindleHub Code Max Ultra Pro — £57.60/month
1148. KindleHub Code Max Ultra Pro+ — £57.65/month
1149. KindleHub Code Ultra Pro Max — £57.70/month
1150. KindleHub Code Ultra Pro Max+ — £57.75/month
1151. KindleHub Code Ultra Max Pro — £57.80/month
1152. KindleHub Code Ultra Max Pro+ — £57.85/month

### Circuit (tiers 1153–1184)

1153. KindleHub Circuit — £57.90/month
1154. KindleHub Circuit + — £57.95/month
1155. KindleHub Circuit Pro — £58.00/month
1156. KindleHub Circuit Pro+ — £58.05/month
1157. KindleHub Circuit Max — £58.10/month
1158. KindleHub Circuit Max+ — £58.15/month
1159. KindleHub Circuit Ultra — £58.20/month
1160. KindleHub Circuit Ultra+ — £58.25/month
1161. KindleHub Circuit Pro Max — £58.30/month
1162. KindleHub Circuit Pro Max+ — £58.35/month
1163. KindleHub Circuit Max Pro — £58.40/month
1164. KindleHub Circuit Max Pro+ — £58.45/month
1165. KindleHub Circuit Pro Ultra — £58.50/month
1166. KindleHub Circuit Pro Ultra+ — £58.55/month
1167. KindleHub Circuit Ultra Pro — £58.60/month
1168. KindleHub Circuit Ultra Pro+ — £58.65/month
1169. KindleHub Circuit Max Ultra — £58.70/month
1170. KindleHub Circuit Max Ultra+ — £58.75/month
1171. KindleHub Circuit Ultra Max — £58.80/month
1172. KindleHub Circuit Ultra Max+ — £58.85/month
1173. KindleHub Circuit Pro Max Ultra — £58.90/month
1174. KindleHub Circuit Pro Max Ultra+ — £58.95/month
1175. KindleHub Circuit Pro Ultra Max — £59.00/month
1176. KindleHub Circuit Pro Ultra Max+ — £59.05/month
1177. KindleHub Circuit Max Pro Ultra — £59.10/month
1178. KindleHub Circuit Max Pro Ultra+ — £59.15/month
1179. KindleHub Circuit Max Ultra Pro — £59.20/month
1180. KindleHub Circuit Max Ultra Pro+ — £59.25/month
1181. KindleHub Circuit Ultra Pro Max — £59.30/month
1182. KindleHub Circuit Ultra Pro Max+ — £59.35/month
1183. KindleHub Circuit Ultra Max Pro — £59.40/month
1184. KindleHub Circuit Ultra Max Pro+ — £59.45/month

### Binary (tiers 1185–1216)

1185. KindleHub Binary — £59.50/month
1186. KindleHub Binary + — £59.55/month
1187. KindleHub Binary Pro — £59.60/month
1188. KindleHub Binary Pro+ — £59.65/month
1189. KindleHub Binary Max — £59.70/month
1190. KindleHub Binary Max+ — £59.75/month
1191. KindleHub Binary Ultra — £59.80/month
1192. KindleHub Binary Ultra+ — £59.85/month
1193. KindleHub Binary Pro Max — £59.90/month
1194. KindleHub Binary Pro Max+ — £59.95/month
1195. KindleHub Binary Max Pro — £60.00/month
1196. KindleHub Binary Max Pro+ — £60.05/month
1197. KindleHub Binary Pro Ultra — £60.10/month
1198. KindleHub Binary Pro Ultra+ — £60.15/month
1199. KindleHub Binary Ultra Pro — £60.20/month
1200. KindleHub Binary Ultra Pro+ — £60.25/month
1201. KindleHub Binary Max Ultra — £60.30/month
1202. KindleHub Binary Max Ultra+ — £60.35/month
1203. KindleHub Binary Ultra Max — £60.40/month
1204. KindleHub Binary Ultra Max+ — £60.45/month
1205. KindleHub Binary Pro Max Ultra — £60.50/month
1206. KindleHub Binary Pro Max Ultra+ — £60.55/month
1207. KindleHub Binary Pro Ultra Max — £60.60/month
1208. KindleHub Binary Pro Ultra Max+ — £60.65/month
1209. KindleHub Binary Max Pro Ultra — £60.70/month
1210. KindleHub Binary Max Pro Ultra+ — £60.75/month
1211. KindleHub Binary Max Ultra Pro — £60.80/month
1212. KindleHub Binary Max Ultra Pro+ — £60.85/month
1213. KindleHub Binary Ultra Pro Max — £60.90/month
1214. KindleHub Binary Ultra Pro Max+ — £60.95/month
1215. KindleHub Binary Ultra Max Pro — £61.00/month
1216. KindleHub Binary Ultra Max Pro+ — £61.05/month

### Digital (tiers 1217–1248)

1217. KindleHub Digital — £61.10/month
1218. KindleHub Digital + — £61.15/month
1219. KindleHub Digital Pro — £61.20/month
1220. KindleHub Digital Pro+ — £61.25/month
1221. KindleHub Digital Max — £61.30/month
1222. KindleHub Digital Max+ — £61.35/month
1223. KindleHub Digital Ultra — £61.40/month
1224. KindleHub Digital Ultra+ — £61.45/month
1225. KindleHub Digital Pro Max — £61.50/month
1226. KindleHub Digital Pro Max+ — £61.55/month
1227. KindleHub Digital Max Pro — £61.60/month
1228. KindleHub Digital Max Pro+ — £61.65/month
1229. KindleHub Digital Pro Ultra — £61.70/month
1230. KindleHub Digital Pro Ultra+ — £61.75/month
1231. KindleHub Digital Ultra Pro — £61.80/month
1232. KindleHub Digital Ultra Pro+ — £61.85/month
1233. KindleHub Digital Max Ultra — £61.90/month
1234. KindleHub Digital Max Ultra+ — £61.95/month
1235. KindleHub Digital Ultra Max — £62.00/month
1236. KindleHub Digital Ultra Max+ — £62.05/month
1237. KindleHub Digital Pro Max Ultra — £62.10/month
1238. KindleHub Digital Pro Max Ultra+ — £62.15/month
1239. KindleHub Digital Pro Ultra Max — £62.20/month
1240. KindleHub Digital Pro Ultra Max+ — £62.25/month
1241. KindleHub Digital Max Pro Ultra — £62.30/month
1242. KindleHub Digital Max Pro Ultra+ — £62.35/month
1243. KindleHub Digital Max Ultra Pro — £62.40/month
1244. KindleHub Digital Max Ultra Pro+ — £62.45/month
1245. KindleHub Digital Ultra Pro Max — £62.50/month
1246. KindleHub Digital Ultra Pro Max+ — £62.55/month
1247. KindleHub Digital Ultra Max Pro — £62.60/month
1248. KindleHub Digital Ultra Max Pro+ — £62.65/month

### Virtual (tiers 1249–1280)

1249. KindleHub Virtual — £62.70/month
1250. KindleHub Virtual + — £62.75/month
1251. KindleHub Virtual Pro — £62.80/month
1252. KindleHub Virtual Pro+ — £62.85/month
1253. KindleHub Virtual Max — £62.90/month
1254. KindleHub Virtual Max+ — £62.95/month
1255. KindleHub Virtual Ultra — £63.00/month
1256. KindleHub Virtual Ultra+ — £63.05/month
1257. KindleHub Virtual Pro Max — £63.10/month
1258. KindleHub Virtual Pro Max+ — £63.15/month
1259. KindleHub Virtual Max Pro — £63.20/month
1260. KindleHub Virtual Max Pro+ — £63.25/month
1261. KindleHub Virtual Pro Ultra — £63.30/month
1262. KindleHub Virtual Pro Ultra+ — £63.35/month
1263. KindleHub Virtual Ultra Pro — £63.40/month
1264. KindleHub Virtual Ultra Pro+ — £63.45/month
1265. KindleHub Virtual Max Ultra — £63.50/month
1266. KindleHub Virtual Max Ultra+ — £63.55/month
1267. KindleHub Virtual Ultra Max — £63.60/month
1268. KindleHub Virtual Ultra Max+ — £63.65/month
1269. KindleHub Virtual Pro Max Ultra — £63.70/month
1270. KindleHub Virtual Pro Max Ultra+ — £63.75/month
1271. KindleHub Virtual Pro Ultra Max — £63.80/month
1272. KindleHub Virtual Pro Ultra Max+ — £63.85/month
1273. KindleHub Virtual Max Pro Ultra — £63.90/month
1274. KindleHub Virtual Max Pro Ultra+ — £63.95/month
1275. KindleHub Virtual Max Ultra Pro — £64.00/month
1276. KindleHub Virtual Max Ultra Pro+ — £64.05/month
1277. KindleHub Virtual Ultra Pro Max — £64.10/month
1278. KindleHub Virtual Ultra Pro Max+ — £64.15/month
1279. KindleHub Virtual Ultra Max Pro — £64.20/month
1280. KindleHub Virtual Ultra Max Pro+ — £64.25/month

### Native (tiers 1281–1312)

1281. KindleHub Native — £64.30/month
1282. KindleHub Native + — £64.35/month
1283. KindleHub Native Pro — £64.40/month
1284. KindleHub Native Pro+ — £64.45/month
1285. KindleHub Native Max — £64.50/month
1286. KindleHub Native Max+ — £64.55/month
1287. KindleHub Native Ultra — £64.60/month
1288. KindleHub Native Ultra+ — £64.65/month
1289. KindleHub Native Pro Max — £64.70/month
1290. KindleHub Native Pro Max+ — £64.75/month
1291. KindleHub Native Max Pro — £64.80/month
1292. KindleHub Native Max Pro+ — £64.85/month
1293. KindleHub Native Pro Ultra — £64.90/month
1294. KindleHub Native Pro Ultra+ — £64.95/month
1295. KindleHub Native Ultra Pro — £65.00/month
1296. KindleHub Native Ultra Pro+ — £65.05/month
1297. KindleHub Native Max Ultra — £65.10/month
1298. KindleHub Native Max Ultra+ — £65.15/month
1299. KindleHub Native Ultra Max — £65.20/month
1300. KindleHub Native Ultra Max+ — £65.25/month
1301. KindleHub Native Pro Max Ultra — £65.30/month
1302. KindleHub Native Pro Max Ultra+ — £65.35/month
1303. KindleHub Native Pro Ultra Max — £65.40/month
1304. KindleHub Native Pro Ultra Max+ — £65.45/month
1305. KindleHub Native Max Pro Ultra — £65.50/month
1306. KindleHub Native Max Pro Ultra+ — £65.55/month
1307. KindleHub Native Max Ultra Pro — £65.60/month
1308. KindleHub Native Max Ultra Pro+ — £65.65/month
1309. KindleHub Native Ultra Pro Max — £65.70/month
1310. KindleHub Native Ultra Pro Max+ — £65.75/month
1311. KindleHub Native Ultra Max Pro — £65.80/month
1312. KindleHub Native Ultra Max Pro+ — £65.85/month

### Compact (tiers 1313–1344)

1313. KindleHub Compact — £65.90/month
1314. KindleHub Compact + — £65.95/month
1315. KindleHub Compact Pro — £66.00/month
1316. KindleHub Compact Pro+ — £66.05/month
1317. KindleHub Compact Max — £66.10/month
1318. KindleHub Compact Max+ — £66.15/month
1319. KindleHub Compact Ultra — £66.20/month
1320. KindleHub Compact Ultra+ — £66.25/month
1321. KindleHub Compact Pro Max — £66.30/month
1322. KindleHub Compact Pro Max+ — £66.35/month
1323. KindleHub Compact Max Pro — £66.40/month
1324. KindleHub Compact Max Pro+ — £66.45/month
1325. KindleHub Compact Pro Ultra — £66.50/month
1326. KindleHub Compact Pro Ultra+ — £66.55/month
1327. KindleHub Compact Ultra Pro — £66.60/month
1328. KindleHub Compact Ultra Pro+ — £66.65/month
1329. KindleHub Compact Max Ultra — £66.70/month
1330. KindleHub Compact Max Ultra+ — £66.75/month
1331. KindleHub Compact Ultra Max — £66.80/month
1332. KindleHub Compact Ultra Max+ — £66.85/month
1333. KindleHub Compact Pro Max Ultra — £66.90/month
1334. KindleHub Compact Pro Max Ultra+ — £66.95/month
1335. KindleHub Compact Pro Ultra Max — £67.00/month
1336. KindleHub Compact Pro Ultra Max+ — £67.05/month
1337. KindleHub Compact Max Pro Ultra — £67.10/month
1338. KindleHub Compact Max Pro Ultra+ — £67.15/month
1339. KindleHub Compact Max Ultra Pro — £67.20/month
1340. KindleHub Compact Max Ultra Pro+ — £67.25/month
1341. KindleHub Compact Ultra Pro Max — £67.30/month
1342. KindleHub Compact Ultra Pro Max+ — £67.35/month
1343. KindleHub Compact Ultra Max Pro — £67.40/month
1344. KindleHub Compact Ultra Max Pro+ — £67.45/month

### Rapid (tiers 1345–1376)

1345. KindleHub Rapid — £67.50/month
1346. KindleHub Rapid + — £67.55/month
1347. KindleHub Rapid Pro — £67.60/month
1348. KindleHub Rapid Pro+ — £67.65/month
1349. KindleHub Rapid Max — £67.70/month
1350. KindleHub Rapid Max+ — £67.75/month
1351. KindleHub Rapid Ultra — £67.80/month
1352. KindleHub Rapid Ultra+ — £67.85/month
1353. KindleHub Rapid Pro Max — £67.90/month
1354. KindleHub Rapid Pro Max+ — £67.95/month
1355. KindleHub Rapid Max Pro — £68.00/month
1356. KindleHub Rapid Max Pro+ — £68.05/month
1357. KindleHub Rapid Pro Ultra — £68.10/month
1358. KindleHub Rapid Pro Ultra+ — £68.15/month
1359. KindleHub Rapid Ultra Pro — £68.20/month
1360. KindleHub Rapid Ultra Pro+ — £68.25/month
1361. KindleHub Rapid Max Ultra — £68.30/month
1362. KindleHub Rapid Max Ultra+ — £68.35/month
1363. KindleHub Rapid Ultra Max — £68.40/month
1364. KindleHub Rapid Ultra Max+ — £68.45/month
1365. KindleHub Rapid Pro Max Ultra — £68.50/month
1366. KindleHub Rapid Pro Max Ultra+ — £68.55/month
1367. KindleHub Rapid Pro Ultra Max — £68.60/month
1368. KindleHub Rapid Pro Ultra Max+ — £68.65/month
1369. KindleHub Rapid Max Pro Ultra — £68.70/month
1370. KindleHub Rapid Max Pro Ultra+ — £68.75/month
1371. KindleHub Rapid Max Ultra Pro — £68.80/month
1372. KindleHub Rapid Max Ultra Pro+ — £68.85/month
1373. KindleHub Rapid Ultra Pro Max — £68.90/month
1374. KindleHub Rapid Ultra Pro Max+ — £68.95/month
1375. KindleHub Rapid Ultra Max Pro — £69.00/month
1376. KindleHub Rapid Ultra Max Pro+ — £69.05/month

### Sonic (tiers 1377–1408)

1377. KindleHub Sonic — £69.10/month
1378. KindleHub Sonic + — £69.15/month
1379. KindleHub Sonic Pro — £69.20/month
1380. KindleHub Sonic Pro+ — £69.25/month
1381. KindleHub Sonic Max — £69.30/month
1382. KindleHub Sonic Max+ — £69.35/month
1383. KindleHub Sonic Ultra — £69.40/month
1384. KindleHub Sonic Ultra+ — £69.45/month
1385. KindleHub Sonic Pro Max — £69.50/month
1386. KindleHub Sonic Pro Max+ — £69.55/month
1387. KindleHub Sonic Max Pro — £69.60/month
1388. KindleHub Sonic Max Pro+ — £69.65/month
1389. KindleHub Sonic Pro Ultra — £69.70/month
1390. KindleHub Sonic Pro Ultra+ — £69.75/month
1391. KindleHub Sonic Ultra Pro — £69.80/month
1392. KindleHub Sonic Ultra Pro+ — £69.85/month
1393. KindleHub Sonic Max Ultra — £69.90/month
1394. KindleHub Sonic Max Ultra+ — £69.95/month
1395. KindleHub Sonic Ultra Max — £70.00/month
1396. KindleHub Sonic Ultra Max+ — £70.05/month
1397. KindleHub Sonic Pro Max Ultra — £70.10/month
1398. KindleHub Sonic Pro Max Ultra+ — £70.15/month
1399. KindleHub Sonic Pro Ultra Max — £70.20/month
1400. KindleHub Sonic Pro Ultra Max+ — £70.25/month
1401. KindleHub Sonic Max Pro Ultra — £70.30/month
1402. KindleHub Sonic Max Pro Ultra+ — £70.35/month
1403. KindleHub Sonic Max Ultra Pro — £70.40/month
1404. KindleHub Sonic Max Ultra Pro+ — £70.45/month
1405. KindleHub Sonic Ultra Pro Max — £70.50/month
1406. KindleHub Sonic Ultra Pro Max+ — £70.55/month
1407. KindleHub Sonic Ultra Max Pro — £70.60/month
1408. KindleHub Sonic Ultra Max Pro+ — £70.65/month

### Rocket (tiers 1409–1440)

1409. KindleHub Rocket — £70.70/month
1410. KindleHub Rocket + — £70.75/month
1411. KindleHub Rocket Pro — £70.80/month
1412. KindleHub Rocket Pro+ — £70.85/month
1413. KindleHub Rocket Max — £70.90/month
1414. KindleHub Rocket Max+ — £70.95/month
1415. KindleHub Rocket Ultra — £71.00/month
1416. KindleHub Rocket Ultra+ — £71.05/month
1417. KindleHub Rocket Pro Max — £71.10/month
1418. KindleHub Rocket Pro Max+ — £71.15/month
1419. KindleHub Rocket Max Pro — £71.20/month
1420. KindleHub Rocket Max Pro+ — £71.25/month
1421. KindleHub Rocket Pro Ultra — £71.30/month
1422. KindleHub Rocket Pro Ultra+ — £71.35/month
1423. KindleHub Rocket Ultra Pro — £71.40/month
1424. KindleHub Rocket Ultra Pro+ — £71.45/month
1425. KindleHub Rocket Max Ultra — £71.50/month
1426. KindleHub Rocket Max Ultra+ — £71.55/month
1427. KindleHub Rocket Ultra Max — £71.60/month
1428. KindleHub Rocket Ultra Max+ — £71.65/month
1429. KindleHub Rocket Pro Max Ultra — £71.70/month
1430. KindleHub Rocket Pro Max Ultra+ — £71.75/month
1431. KindleHub Rocket Pro Ultra Max — £71.80/month
1432. KindleHub Rocket Pro Ultra Max+ — £71.85/month
1433. KindleHub Rocket Max Pro Ultra — £71.90/month
1434. KindleHub Rocket Max Pro Ultra+ — £71.95/month
1435. KindleHub Rocket Max Ultra Pro — £72.00/month
1436. KindleHub Rocket Max Ultra Pro+ — £72.05/month
1437. KindleHub Rocket Ultra Pro Max — £72.10/month
1438. KindleHub Rocket Ultra Pro Max+ — £72.15/month
1439. KindleHub Rocket Ultra Max Pro — £72.20/month
1440. KindleHub Rocket Ultra Max Pro+ — £72.25/month

### Jet (tiers 1441–1472)

1441. KindleHub Jet — £72.30/month
1442. KindleHub Jet + — £72.35/month
1443. KindleHub Jet Pro — £72.40/month
1444. KindleHub Jet Pro+ — £72.45/month
1445. KindleHub Jet Max — £72.50/month
1446. KindleHub Jet Max+ — £72.55/month
1447. KindleHub Jet Ultra — £72.60/month
1448. KindleHub Jet Ultra+ — £72.65/month
1449. KindleHub Jet Pro Max — £72.70/month
1450. KindleHub Jet Pro Max+ — £72.75/month
1451. KindleHub Jet Max Pro — £72.80/month
1452. KindleHub Jet Max Pro+ — £72.85/month
1453. KindleHub Jet Pro Ultra — £72.90/month
1454. KindleHub Jet Pro Ultra+ — £72.95/month
1455. KindleHub Jet Ultra Pro — £73.00/month
1456. KindleHub Jet Ultra Pro+ — £73.05/month
1457. KindleHub Jet Max Ultra — £73.10/month
1458. KindleHub Jet Max Ultra+ — £73.15/month
1459. KindleHub Jet Ultra Max — £73.20/month
1460. KindleHub Jet Ultra Max+ — £73.25/month
1461. KindleHub Jet Pro Max Ultra — £73.30/month
1462. KindleHub Jet Pro Max Ultra+ — £73.35/month
1463. KindleHub Jet Pro Ultra Max — £73.40/month
1464. KindleHub Jet Pro Ultra Max+ — £73.45/month
1465. KindleHub Jet Max Pro Ultra — £73.50/month
1466. KindleHub Jet Max Pro Ultra+ — £73.55/month
1467. KindleHub Jet Max Ultra Pro — £73.60/month
1468. KindleHub Jet Max Ultra Pro+ — £73.65/month
1469. KindleHub Jet Ultra Pro Max — £73.70/month
1470. KindleHub Jet Ultra Pro Max+ — £73.75/month
1471. KindleHub Jet Ultra Max Pro — £73.80/month
1472. KindleHub Jet Ultra Max Pro+ — £73.85/month

### Aero (tiers 1473–1504)

1473. KindleHub Aero — £73.90/month
1474. KindleHub Aero + — £73.95/month
1475. KindleHub Aero Pro — £74.00/month
1476. KindleHub Aero Pro+ — £74.05/month
1477. KindleHub Aero Max — £74.10/month
1478. KindleHub Aero Max+ — £74.15/month
1479. KindleHub Aero Ultra — £74.20/month
1480. KindleHub Aero Ultra+ — £74.25/month
1481. KindleHub Aero Pro Max — £74.30/month
1482. KindleHub Aero Pro Max+ — £74.35/month
1483. KindleHub Aero Max Pro — £74.40/month
1484. KindleHub Aero Max Pro+ — £74.45/month
1485. KindleHub Aero Pro Ultra — £74.50/month
1486. KindleHub Aero Pro Ultra+ — £74.55/month
1487. KindleHub Aero Ultra Pro — £74.60/month
1488. KindleHub Aero Ultra Pro+ — £74.65/month
1489. KindleHub Aero Max Ultra — £74.70/month
1490. KindleHub Aero Max Ultra+ — £74.75/month
1491. KindleHub Aero Ultra Max — £74.80/month
1492. KindleHub Aero Ultra Max+ — £74.85/month
1493. KindleHub Aero Pro Max Ultra — £74.90/month
1494. KindleHub Aero Pro Max Ultra+ — £74.95/month
1495. KindleHub Aero Pro Ultra Max — £75.00/month
1496. KindleHub Aero Pro Ultra Max+ — £75.05/month
1497. KindleHub Aero Max Pro Ultra — £75.10/month
1498. KindleHub Aero Max Pro Ultra+ — £75.15/month
1499. KindleHub Aero Max Ultra Pro — £75.20/month
1500. KindleHub Aero Max Ultra Pro+ — £75.25/month
1501. KindleHub Aero Ultra Pro Max — £75.30/month
1502. KindleHub Aero Ultra Pro Max+ — £75.35/month
1503. KindleHub Aero Ultra Max Pro — £75.40/month
1504. KindleHub Aero Ultra Max Pro+ — £75.45/month

### Nimbus (tiers 1505–1536)

1505. KindleHub Nimbus — £75.50/month
1506. KindleHub Nimbus + — £75.55/month
1507. KindleHub Nimbus Pro — £75.60/month
1508. KindleHub Nimbus Pro+ — £75.65/month
1509. KindleHub Nimbus Max — £75.70/month
1510. KindleHub Nimbus Max+ — £75.75/month
1511. KindleHub Nimbus Ultra — £75.80/month
1512. KindleHub Nimbus Ultra+ — £75.85/month
1513. KindleHub Nimbus Pro Max — £75.90/month
1514. KindleHub Nimbus Pro Max+ — £75.95/month
1515. KindleHub Nimbus Max Pro — £76.00/month
1516. KindleHub Nimbus Max Pro+ — £76.05/month
1517. KindleHub Nimbus Pro Ultra — £76.10/month
1518. KindleHub Nimbus Pro Ultra+ — £76.15/month
1519. KindleHub Nimbus Ultra Pro — £76.20/month
1520. KindleHub Nimbus Ultra Pro+ — £76.25/month
1521. KindleHub Nimbus Max Ultra — £76.30/month
1522. KindleHub Nimbus Max Ultra+ — £76.35/month
1523. KindleHub Nimbus Ultra Max — £76.40/month
1524. KindleHub Nimbus Ultra Max+ — £76.45/month
1525. KindleHub Nimbus Pro Max Ultra — £76.50/month
1526. KindleHub Nimbus Pro Max Ultra+ — £76.55/month
1527. KindleHub Nimbus Pro Ultra Max — £76.60/month
1528. KindleHub Nimbus Pro Ultra Max+ — £76.65/month
1529. KindleHub Nimbus Max Pro Ultra — £76.70/month
1530. KindleHub Nimbus Max Pro Ultra+ — £76.75/month
1531. KindleHub Nimbus Max Ultra Pro — £76.80/month
1532. KindleHub Nimbus Max Ultra Pro+ — £76.85/month
1533. KindleHub Nimbus Ultra Pro Max — £76.90/month
1534. KindleHub Nimbus Ultra Pro Max+ — £76.95/month
1535. KindleHub Nimbus Ultra Max Pro — £77.00/month
1536. KindleHub Nimbus Ultra Max Pro+ — £77.05/month

### Signal (tiers 1537–1568)

1537. KindleHub Signal — £77.10/month
1538. KindleHub Signal + — £77.15/month
1539. KindleHub Signal Pro — £77.20/month
1540. KindleHub Signal Pro+ — £77.25/month
1541. KindleHub Signal Max — £77.30/month
1542. KindleHub Signal Max+ — £77.35/month
1543. KindleHub Signal Ultra — £77.40/month
1544. KindleHub Signal Ultra+ — £77.45/month
1545. KindleHub Signal Pro Max — £77.50/month
1546. KindleHub Signal Pro Max+ — £77.55/month
1547. KindleHub Signal Max Pro — £77.60/month
1548. KindleHub Signal Max Pro+ — £77.65/month
1549. KindleHub Signal Pro Ultra — £77.70/month
1550. KindleHub Signal Pro Ultra+ — £77.75/month
1551. KindleHub Signal Ultra Pro — £77.80/month
1552. KindleHub Signal Ultra Pro+ — £77.85/month
1553. KindleHub Signal Max Ultra — £77.90/month
1554. KindleHub Signal Max Ultra+ — £77.95/month
1555. KindleHub Signal Ultra Max — £78.00/month
1556. KindleHub Signal Ultra Max+ — £78.05/month
1557. KindleHub Signal Pro Max Ultra — £78.10/month
1558. KindleHub Signal Pro Max Ultra+ — £78.15/month
1559. KindleHub Signal Pro Ultra Max — £78.20/month
1560. KindleHub Signal Pro Ultra Max+ — £78.25/month
1561. KindleHub Signal Max Pro Ultra — £78.30/month
1562. KindleHub Signal Max Pro Ultra+ — £78.35/month
1563. KindleHub Signal Max Ultra Pro — £78.40/month
1564. KindleHub Signal Max Ultra Pro+ — £78.45/month
1565. KindleHub Signal Ultra Pro Max — £78.50/month
1566. KindleHub Signal Ultra Pro Max+ — £78.55/month
1567. KindleHub Signal Ultra Max Pro — £78.60/month
1568. KindleHub Signal Ultra Max Pro+ — £78.65/month

### Beacon (tiers 1569–1600)

1569. KindleHub Beacon — £78.70/month
1570. KindleHub Beacon + — £78.75/month
1571. KindleHub Beacon Pro — £78.80/month
1572. KindleHub Beacon Pro+ — £78.85/month
1573. KindleHub Beacon Max — £78.90/month
1574. KindleHub Beacon Max+ — £78.95/month
1575. KindleHub Beacon Ultra — £79.00/month
1576. KindleHub Beacon Ultra+ — £79.05/month
1577. KindleHub Beacon Pro Max — £79.10/month
1578. KindleHub Beacon Pro Max+ — £79.15/month
1579. KindleHub Beacon Max Pro — £79.20/month
1580. KindleHub Beacon Max Pro+ — £79.25/month
1581. KindleHub Beacon Pro Ultra — £79.30/month
1582. KindleHub Beacon Pro Ultra+ — £79.35/month
1583. KindleHub Beacon Ultra Pro — £79.40/month
1584. KindleHub Beacon Ultra Pro+ — £79.45/month
1585. KindleHub Beacon Max Ultra — £79.50/month
1586. KindleHub Beacon Max Ultra+ — £79.55/month
1587. KindleHub Beacon Ultra Max — £79.60/month
1588. KindleHub Beacon Ultra Max+ — £79.65/month
1589. KindleHub Beacon Pro Max Ultra — £79.70/month
1590. KindleHub Beacon Pro Max Ultra+ — £79.75/month
1591. KindleHub Beacon Pro Ultra Max — £79.80/month
1592. KindleHub Beacon Pro Ultra Max+ — £79.85/month
1593. KindleHub Beacon Max Pro Ultra — £79.90/month
1594. KindleHub Beacon Max Pro Ultra+ — £79.95/month
1595. KindleHub Beacon Max Ultra Pro — £80.00/month
1596. KindleHub Beacon Max Ultra Pro+ — £80.05/month
1597. KindleHub Beacon Ultra Pro Max — £80.10/month
1598. KindleHub Beacon Ultra Pro Max+ — £80.15/month
1599. KindleHub Beacon Ultra Max Pro — £80.20/month
1600. KindleHub Beacon Ultra Max Pro+ — £80.25/month

---

_Generated from the agreed ladder formula; verified against sampled tiers._
