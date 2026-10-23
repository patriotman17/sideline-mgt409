# Design review: Sideline (iOS app + web), against Apple's Human Interface Guidelines

Method: the five-lens review from [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill)
(Apple HIG pages pulled from developer.apple.com). Pages read: `accessibility`, `typography`, `color`, `layout`,
`designing-for-ios`, `dark-mode`, `tab-bars`, `sheets`, `buttons`, `motion`, `loading`, `feedback`, `onboarding`,
`generative-ai`, `materials`, `liquid-glass`, `writing`. Artifacts: the source code, the colors in
`mobile/src/theme/palette.json` (contrast computed from hex values, not estimated), and the screenshots in
`docs/report/assets/`. Citations are `page › section`, paraphrased. Date: 2026-10-23.

## Status (2026-10-23)

Fixed: 1 (contrast), 2 (minimum text size), 3 (44 pt icon buttons), 4 (live dot respects Reduce Motion),
5 (title-style button labels), 7 (privacy line in Ask Sideline), 11 (▲ marks the better pregame value; each row
also reads as one sentence to VoiceOver), and the welcome-screen 01/02/03 markers (now icons). Open: 6 (rate an
answer) and 8 (iOS search-style tab), both planned for after the course; 9, 10 and 12 are judgment calls noted in
the report.

## Summary

**Rating: Critical issues** (two accessibility failures, both quick to fix), otherwise **Good**.
Sideline's thesis is clear: *a live NFL game, explained as it happens*. It's remembered for the team-color score
rows and the week clock that replays a real Sunday. The two critical findings are small-text contrast and a few
labels below the minimum size. Fixing them, plus the Medium items, would put it at Good to Excellent.

## Critical

**1. Muted text fails contrast (80 uses in 40 files).**
- What: `mute` `#6C6C70` is 4.02:1 on black and 3.25:1 on cards (`surface` `#1C1C1E`, `bg-white/10`). It's used
  for small text (11-12 pt): "As of Q2 9:20", "Season through Week 4", sources, captions, attributions, "Sample data".
- Why: `accessibility.md › Color and effects`: text up to 17 pt needs at least 4.5:1.
- Fix: `mute` → `#8E8E93` (Apple's system gray): **6.44:1** on black, **5.22:1** on surface, **5.34:1** on cards,
  and still visibly quieter than `sub` (`#A1A1A6`, 8.16:1). One token change in `palette.json`.

**2. Text below the 11 pt minimum (8 places).**
- What: 9 pt end-zone labels in `FieldTracker.tsx:38,57`; 10 pt in `TextTabs.tsx:40` (badge), `ScoreRow.tsx:65`
  ("Spoiler shield") and `:129` (the "Big moment" badge), `Timeline.tsx:49`, `FieldTracker.tsx:30` ("RED ZONE"),
  `Avatar.tsx:39`.
- Why: `typography.md › Specifications`: iOS minimum 11 pt (default 17 pt).
- Fix: raise all to 11 pt. The rotated end-zone labels can stay small if they're decorative and hidden from screen
  readers, since the field already shows the team colors.

## Improvements

**3. Icon buttons are 40×40 pt (Medium).** `IconButton.tsx:29` (`h-10 w-10`): above the 28 pt minimum, below the
44 pt default (`accessibility.md › Buttons and controls`). Fix: `h-11 w-11`, or `hitSlop={4}`.

**4. The live dot pulses forever, even with Reduce Motion on (Medium).** `LiveDot.tsx` loops without checking the
setting; the welcome backdrop, entrances and the web sheet already respect it. `accessibility.md › Motion`: reduce
automatic, repeating animations when Reduce Motion is on. Fix: a static dot when `isReduceMotionEnabled()`.

**5. Button capitalization is mixed (Medium).** Title style: "Create Account", "Log In", "Try Demo". Sentence style:
"Make your call", "Keep watching", "Try again", "Back to live", "My own pace", "Preview this game".
`writing.md › Capitalization` (pick one style per element type and keep it) and `buttons.md › Content`
(title-style button labels, starting with a verb). Fix: title-style for every button ("Make Your Call",
"Keep Watching", "Try Again", "Back to Live").

**6. AI answers can't be rated or reported (Medium).** Sideline already meets most of `generative-ai.md`:
disclosure (✦ Sideline AI on every AI surface), hallucination limits (answers only from tools, sources, confidence,
"some details unverified"), refinement (follow-up chips, Try again). Missing, per the June 2026 update to
`generative-ai.md › Outputs`: a way to tell the app an answer was wrong. Fix: thumbs up / down under each AI answer,
recorded in the audit log, with a short thank-you.

**7. Tell people what the AI sees (Medium).** `generative-ai.md › Privacy`: say what's sent to a server. Fix: one
line under "Ask anything about football": *Your question goes to Sideline's server and an AI model; no account
details are included.* (True today: only the question, earlier questions in this chat, and answer-style
preferences are sent.)

**8. The floating Ask button is an Android-style pattern (Medium, judgment + `tab-bars.md`).** It works, but a
floating action button isn't an iOS idiom, and on Scores it covers the bottom-right corner of the last row until
you scroll. Options: (a) keep it (it's discoverable and consistent with the web), or (b) on iOS, move Ask
Sideline into the tab bar as a separate trailing "search-style" tab, which iOS 26 supports for exactly this kind
of "ask / search anything" destination. Recommendation: (a) for the course deadline, (b) for the real app.

**9. Three of five tabs are previews (Medium).** Compliant with `tab-bars.md › Best practices` (don't hide tabs;
explain unavailable content, which the "Preview · coming next" banners do). Still, it's 60% of the navigation.
Picks has a real counterpart (big-moment picks inside games): showing those there would make one more tab real.

**10. Dark appearance only (Low, a deliberate trade-off).** `dark-mode.md`: people expect apps to follow their
system setting. Sideline is always dark, like most sports and video apps (it's watched next to a TV, often in the
evening), and it doesn't offer an app-specific toggle, which the page warns against. Keep it, and say why in the
report.

**11. "Better" is shown by brightness only in the pregame comparison (Low).** `accessibility.md`: don't use color
alone. Fix: a small ▲ next to the better value.

**12. Largest text sizes not tested (limit, not a finding).** React Native text scales with the system setting
(nothing disables it), but fixed-height rows (score rows, chips) may clip at the largest accessibility sizes. Test
at Settings → Accessibility → Larger Text, maximum.

## Craft notes

**Point of view: present, with one templated habit.** The skill warns that "near-black with one acid-green accent"
is one of the most common generated looks. Sideline's black and lime would read as that default, except that the
team colors carry the meaning (gradient rows from away to home team), the scores use Barlow Condensed like a
broadcast score bug, and the welcome screen draws a real football field. That's a point of view. Two things to
tighten:
- **The 01 / 02 / 03 markers** on the welcome screen number three features that aren't a sequence (a template
  habit the skill calls out). Replace with three small icons, or drop the numbers.
- **Give lime a reason** and keep it to that: it already means "your action / selection" (the rule in AGENTS.md),
  the way the yellow line means "line to gain" on TV. Keep it off decoration.

## What works (keep)

- Team-color gradients that encode the matchup; Barlow Condensed for scores and clocks; system type for UI.
- Primary text contrast: white 21:1, secondary `#A1A1A6` 8.16:1, lime 17.8:1, black text on lime buttons 17.8:1.
- AI disclosure everywhere (✦ Sideline AI), sources and "as of" on every answer, refusal instead of guessing.
- Loading: skeletons, "Sideline AI is writing a preview…", "Waking up the Sideline server…", Try Again on errors.
- Sheets with a grabber, a close button, and (native) swipe to dismiss; one sheet at a time.
- Every icon-only control has an accessibility label; Reduce Motion respected by the welcome backdrop, entrances and
  the web sheet animation.
- Preview tabs explain themselves instead of hiding.

## Platform notes

- **iOS (Expo Go / native):** the native tab bar gets Liquid Glass from the system; the glass is only on the
  floating navigation layer, never on content (`liquid-glass.md`), which is correct.
- **Web:** Apple's platform conventions only partly apply (the principles and foundations do). The frosted web tab
  bar imitates the iOS material on the same floating layer only; the centered phone-width column keeps layouts
  identical across sizes (`layout.md`).
