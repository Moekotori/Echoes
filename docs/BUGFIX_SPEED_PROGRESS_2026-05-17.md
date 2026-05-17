# BUG-2026-05-17-001: Playback speed progress interpolation

## Markdown Summary

- Bug ID: BUG-2026-05-17-001
- Severity: High
- Category: Functional playback UI regression
- Components: Player progress bar, lyrics playback clock
- Files:
  - `src/renderer/components/player/PlayerBar.tsx`
  - `src/renderer/pages/LyricsPage.tsx`
  - `src/renderer/components/player/PlayerBar.test.tsx`
  - `src/renderer/pages/LyricsPage.test.tsx`
- Current behavior: At high playback speed, a brief stale audio status update could make the progress bar and active lyric line jump backward.
- Expected behavior: Playback speed should advance the estimated media position, but it should not shorten the wall-clock lag window used to bridge stale status updates.
- Root cause: The interpolation logic multiplied elapsed wall-clock time by playback rate before both estimating media position and checking `maxInterpolatedStatusGapSeconds`.
- Fix: Split elapsed time into wall-clock elapsed seconds and playback-rate-adjusted media elapsed seconds. Use media elapsed time for position estimation and wall-clock elapsed time for stale-status bridge eligibility.
- Follow-up fix: Playback-rate changes are now treated as a clock rebase boundary. If the returned source position is discontinuous from the locally estimated continuous position, the UI keeps the continuous estimate instead of jumping.
- Validation:
  - `npx vitest run src/renderer/components/player/PlayerBar.test.tsx src/renderer/pages/LyricsPage.test.tsx`
  - `npm run typecheck`
  - `npx vitest run`

## JSON Record

```json
{
  "bugId": "BUG-2026-05-17-001",
  "severity": "high",
  "category": "functional",
  "component": "playback-clock",
  "rootCause": "playback-rate-adjusted elapsed time was reused as the wall-clock stale-status bridge interval",
  "fix": "separate wall elapsed seconds from media elapsed seconds and rebase discontinuous playback-rate changes against the continuous local clock",
  "verification": {
    "targetedVitest": "passed",
    "typecheck": "passed",
    "fullVitest": "passed"
  }
}
```

## CSV Record

```csv
bug_id,severity,category,component,current_behavior,expected_behavior,verification
BUG-2026-05-17-001,High,Functional,playback-clock,"high-speed playback or speed changes could make progress and lyrics jump on stale status","speed changes keep continuous media time without shrinking stale-status wall-clock bridge window","targeted vitest; typecheck; full vitest"
```
