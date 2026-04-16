---
description: Design system — colors, panels, buttons, typography, borders, layout patterns
globs: "**/*.svelte,**/*.css,**/app.css"
alwaysApply: false
---

# Design System

For component APIs (ProfilePic, AppPic, Modal, Selector, etc.), see `spec/guidelines/DESIGN_COMPONENTS.md`.

## Color System

### Preset Gradients

Use preset gradients from `src/app.css`. Never define ad-hoc gradients.

| Variable | Use Case |
|----------|----------|
| `--gradient-blurple`, `-hover` | Primary CTAs |
| `--gradient-gold`, `-hover`, `-gold66/33/16` | Gold accents (zaps) |
| `--gradient-gray`, `-hover`, `-gray66/33/16` | Neutral accents |
| `--gradient-rouge`, `-hover` | Destructive actions |
| `--gradient-green`, `-hover` | Success |
| `--gradient-white-blurple`, `--gradient-white-gold`, etc. | Header/text gradients |

Usage: `background: var(--gradient-gold);`

### White Opacity Scale

| Variable | Opacity | Use Case |
|----------|---------|----------|
| `--white` | 100% | Pure white text |
| `--white66` | 66% | Secondary text |
| `--white33` | 33% | Tertiary text, timestamps |
| `--white16` | 16% | Element borders |
| `--white11` | 11% | Dividers |
| `--white8` | 8% | Subtle backgrounds |
| `--white4` | 4% | Very subtle backgrounds |

Other base variables: `--black/66/33/16/8`, `--gray/66/44/33`, `--blurpleColor/66/33`, `--goldColor/66`.

### Semantic Colors

`--background`, `--foreground`, `--card` (gray66), `--primary` (blurple), `--secondary` (gold), `--muted-foreground`, `--border` (white16).

Always use CSS variables: `color: hsl(var(--foreground));`

### Profile Text Color

When displaying text in a user's profile color, use `getProfileTextColor()` from `$lib/utils/color.js` to adjust brightness for readability. Never use CSS `filter: brightness()`.

## Typography

- **Inter** (`--font-sans`) — body and headings
- **JetBrains Mono** (`--font-mono`) — code blocks only (not npubs, not user IDs)
- Body default: 18px regular (`regular18` on `body`)

### Literal tokens — `[weight][size]`

Weight scale: `regular` = 400, `medium` = 500, `semibold` = 600, `bold` = 650.

| Token | Size | Weight |
|-------|------|--------|
| `regular12`, `semibold12` | 12px | 400 / 600 |
| `regular14`, `medium14`, `semibold14` | 14px | 400 / 500 / 600 |
| `regular16`, `medium16`, `semibold16` | 16px | 400 / 500 / 600 |
| `regular18`, `semibold18`, `bold18` | 18px | 400 / 600 / 650 |
| `semibold20` | 20px | 600 |

### Compositional classes (app.css)

| Class | Use | Properties |
|-------|-----|------------|
| `.modal-heading` | Modal/overlay titles | 30px, 650, tight tracking, centered |
| `.header-title` | Site brand name, page titles | 18px → 20px at 1024px, 600, tight tracking |
| `.eyebrow-label` | Section eyebrows | 12px, 500, uppercase, wide tracking |

### Landing display classes (`src/lib/styles/landing-display.css`)

Import via `import '$lib/styles/landing-display.css'` in landing component scripts.

| Class | Use | Size |
|-------|-----|------|
| `.display-hero` | Main h1 hero headings | `clamp(36px, 7vw, 72px)`, 650 |
| `.display-section` | Section h2 headings | `clamp(28px, 4vw, 48px)`, 650 |
| `.display-lead` | Lead body paragraphs | 18px → 20px at 768px, 400 |

## Panels

Panels are the basic container element. **Panels have NO border by default.**

| Class | Description |
|-------|-------------|
| `.panel` | Default: `gray66` bg, 16px radius, 16px padding |
| `.panel-light` | `white16` bg |
| `.panel-dark` | `black33` bg |
| `.panel-p-12/16/20/24` | Padding variants |
| `.panel-clickable` | Adds cursor pointer + focus outline (NO scale effect) |

Rules:
- Never add borders to panels or panel-like containers
- Always use panel classes for containers — no custom card styles

## Buttons

**All buttons MUST use standardized classes. No custom button styles.**

### Types & Sizes

| | Large (42→38px mobile) | Default (~38px) | Small (32px, pill) | XS (24px, pill) |
|---|---|---|---|---|
| Primary (blurple) | `.btn-primary-large` | `.btn-primary` | `.btn-primary-small` | `.btn-primary-xs` |
| Secondary (gray66) | `.btn-secondary-large` | `.btn-secondary` | `.btn-secondary-small` | `.btn-secondary-xs` |
| Glass (blur+border) | `.btn-glass-large` | `.btn-glass` | `.btn-glass-small` | `.btn-glass-xs` |

### CTA Sizing Rules

- **Landing page**: Always `.btn-primary-large`
- **Desktop (≥768px)**: CTAs use `.btn-primary-large`
- **Mobile (<768px)**: Non-landing CTAs use `.btn-primary`
- Glass with chevron: add `.btn-glass-with-chevron`, use `ChevronRight` with `color="hsl(var(--white33))"` `size={18}`

### Button Rules

- No borders or outlines (exception: glass buttons use `white8` border)
- All buttons have `cursor: pointer`, hover/active scale, primary buttons glow on hover
- Radius: 16px for large/default, pill for small/xs
- In modals: use `-large` variants; secondary buttons add `.btn-secondary-modal` (black33 bg, white66 text)

Special exceptions: `.split-button-*`, `.search-bar-btn`, `.profile-avatar-btn`

## Borders & Outlines

- Thickness: `0.33px solid` — never thicker for element outlines
- Never use `outline` property — use `border`

| Color | Use Case |
|-------|----------|
| `white8` | Overlay containers (modals, bottom bars) |
| `white16` | Default (cards, inputs, profile pics) |
| `white33` | Emphasized (focused inputs) |

Panels and panel-like containers have NO border.

## Dividers

- Thickness: `1.4px` (never 1px) — Color: `white11` (never white16)
- Classes: `.divider` (horizontal), `.divider-vertical`

## Responsive Sizing

Two breakpoints only for functional UI (not landing/marketing sections):

| Name | Width | Tailwind |
|------|-------|----------|
| Mobile | < 768px | Default |
| Desktop | ≥ 768px | `md:` |

Mobile-first: write mobile as default, override at 768px. Desktop elements ~15-25% larger.

## Hover Scale Effects

Scale effects are ONLY for:
- Buttons (all `.btn-*`): hover `scale(1.02)`, active `scale(0.98)`
- ProfilePic, AppPic: hover `scale(1.04)`, active `scale(0.96)`
- Clickable images in horizontal scroll

**Never scale** panels, cards with text, list items with descriptions, or containers with paragraphs.

## Mandatory Components

These components are required — no custom implementations.

| Component | Location | Use For |
|-----------|----------|---------|
| `ProfilePic` | `$lib/components/ProfilePic.svelte` | All profile pictures |
| `AppPic` | `$lib/components/AppPic.svelte` | All app icons |
| `Timestamp` | `$lib/components/common/Timestamp.svelte` | All timestamps |
| `Modal` | `$lib/components/Modal.svelte` | All modal dialogs |
| `Selector` | `$lib/components/Selector.svelte` | All tab/option selectors |
| `EmptyState` | `$lib/components/common/EmptyState.svelte` | All empty states |
| `SkeletonLoader` | `$lib/components/SkeletonLoader.svelte` | Image/title loading states |

For component props, usage examples, and fallback behavior, see `spec/guidelines/DESIGN_COMPONENTS.md`.

## General Rules

- All clickable elements MUST have `cursor: pointer`
- Use CSS variables for all colors — never hardcode
- Never create custom button or icon styles
- Use `stripUrlForDisplay()` from `$lib/utils/url.js` for visible URL text (no protocol, no trailing slash)
