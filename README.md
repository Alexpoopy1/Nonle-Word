# Nonle Word — NONA

A fast daily word-ladder game: turn a fresh four-letter word into **NONA** by
changing one letter at a time. Every step must be a valid English word.

## Play

The current production build is available at:

**https://nona-word-game.alexpoopy21.chatgpt.site**

## Features

- Daily puzzle and unlimited endless rounds
- Easy, Warm, and Inferno difficulty levels
- 5,500+ bundled four-letter English words
- Shortest-path calculation and par score
- Context-aware hints, undo, and restart
- Win statistics, averages, best score, and daily streaks
- Saved game progress and preferences
- Shareable results
- Optional sound effects
- Responsive keyboard and touch controls
- Accessible, light fire-themed interface

## How to play

1. Start from the generated four-letter word.
2. Change exactly one letter.
3. Submit a valid English word.
4. Keep making legal changes until the word becomes `NONA`.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Validation

```bash
npm test
npm run lint
```

`npm test` creates and validates the production Sites build, then checks the
rendered application output.

## Deploy

### Vercel

Import this repository into Vercel. The included `vercel.json` runs a standard
Next.js production build.

### OpenAI Sites

The repository also retains its Vinext and Cloudflare-compatible build setup
used by the current production deployment.

## Tech

- React 19
- Next.js 16
- TypeScript
- Vinext and Vite
- CSS with responsive, reduced-motion, and accessibility support
