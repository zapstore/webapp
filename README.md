# Zapstore PWA

A fast, SEO-friendly, local-first web interface for the Zapstore app distribution network built on Nostr.

Enables discovering apps, viewing detailed metadata, and connecting users to the Zapstore mobile app for installation.

## Tech Stack

- **SvelteKit** — Server-rendered app with Node.js adapter
- **Dexie.js** — Reactive IndexedDB layer with liveQuery
- **nostr-tools** — Nostr protocol implementation
- **Tailwind CSS** — Styling

## Development

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Other Commands

```bash
bun run build      # Build for production
bun run preview    # Preview production build
bun run check      # Run TypeScript checks
bun run lint       # Run ESLint
bun run format     # Format code with Prettier
```

## Documentation

See `spec/guidelines/` for architecture, vision, and development guidelines.
