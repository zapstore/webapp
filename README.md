# Zapstore PWA

A fast, SEO-friendly, local-first web interface for the Zapstore app distribution network built on Nostr.

Enables discovering apps, viewing detailed metadata, and connecting users to the Zapstore mobile app for installation.

## Tech Stack

- **SvelteKit** — Static site generation with prerendering
- **Applesauce** — Nostr data layer (EventStore + IndexedDB)
- **Tailwind CSS** — Styling

## Development

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Other Commands

```bash
pnpm build      # Build for production
pnpm preview    # Preview production build
pnpm check      # Run TypeScript checks
pnpm lint       # Run ESLint
pnpm format     # Format code with Prettier
```

## Documentation

See `spec/guidelines/` for architecture, vision, and development guidelines.
