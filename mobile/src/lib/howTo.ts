import type { Ionicons } from '@expo/vector-icons';

/** Device key: set once the first-launch guide has been seen (or skipped). */
export const HOW_TO_SEEN_KEY = 'sideline.howToSeen.v1';

export interface HowToStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

/** The four things a first-time user needs, in the order they'll meet them. */
export const HOW_TO_STEPS: readonly HowToStep[] = [
  {
    icon: 'play-circle',
    title: 'Start the clock',
    body: 'Scores replays the real 2025 Week 5 on one clock. Press ▶, pick a speed, or use Jump to (try Sunday · 1:00 PM). Games go live exactly as they did.',
  },
  {
    icon: 'tv',
    title: 'Open a live game',
    body: 'Tap any live game to follow it play by play: the field, win odds and every play. It stays in sync with the clock.',
  },
  {
    icon: 'flag',
    title: 'Make your call',
    body: 'On big moments, like a 4th down late in a close game, play pauses for a few seconds. Pick what happens next and earn points if you’re right.',
  },
  {
    icon: 'sparkles',
    title: 'Ask anything',
    body: 'Confused? Ask AI inside a game knows exactly what has happened so far. The lime Ask button answers any football question: rules, players, teams, history.',
  },
];

/** Show the guide automatically only when the device has no record of it (a read error counts as seen). */
export function shouldAutoShowHowTo(stored: string | null | undefined): boolean {
  return stored == null;
}
