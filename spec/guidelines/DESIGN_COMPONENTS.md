# Design System — Component Reference

Reference documentation for mandatory components. Read this when working on or with these components.
For design tokens, panels, buttons, colors, and layout patterns, see `spec/guidelines/DESIGN_SYSTEM.md`.

---

## Icon Standards

This project uses a custom SVG icon system in `src/lib/components/icons/`. Icons support fill and outline variants.

### Creating a New Icon

1. Export SVG from Figma (no "id" attribute, outline stroke ON)
2. Create component in `src/lib/components/icons/`:

```svelte
<script>
  import BaseIcon from "./BaseIcon.svelte";
  export let variant = "outline";
  export let strokeWidth = 1.4;
  export let color = "hsl(var(--foreground))";
  export let size = 24;
  export let className = "";
</script>

<BaseIcon {variant} {strokeWidth} {color} {size} {className}>
  <svg width={size} height={size} viewBox="0 0 8 14"
    fill={variant === "fill" ? color : "none"}
    stroke={variant === "outline" ? color : "none"}
    stroke-width={variant === "outline" ? strokeWidth : 0}
    stroke-linecap="round" stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg">
    <path d="..." />
  </svg>
</BaseIcon>
```

3. Export from `src/lib/components/icons/index.js`

### Icon Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"fill"` \| `"outline"` | `"outline"` | Render mode |
| `strokeWidth` | `1.4` \| `2.8` | `1.4` | Outline stroke width |
| `color` | CSS color | `"hsl(var(--foreground))"` | Icon color |
| `size` | number | `24` | Size in pixels |
| `className` | string | `""` | Additional CSS classes |

### Color Reference for Icons

- `hsl(var(--foreground))` — Default text
- `hsl(var(--white8/11/16/33/66))` — White opacity variants
- `hsl(var(--primary))` — Primary accent
- `hsl(var(--muted-foreground))` — Muted text

### Best Practices

- Default to outline variant, 1.4px stroke
- Standard sizes: 16, 20, 24, 32px
- Always use CSS variables for colors
- Fallback to `lucide-svelte` for generic UI icons not yet custom-built

---

## Loading States & Skeleton Loader

### The 100ms Rule

Loading UI MUST only appear after a 100ms delay. Before that, the screen is blank.

```svelte
<script>
  import { onMount } from "svelte";
  let showLoadingUI = false;
  let isLoading = true;
  onMount(() => {
    const timer = setTimeout(() => { if (isLoading) showLoadingUI = true; }, 100);
    return () => clearTimeout(timer);
  });
</script>

{#if isLoading && showLoadingUI}
  <!-- Loading UI -->
{:else if !isLoading}
  <!-- Content -->
{/if}
```

### Two Types of Placeholders

| Content Type | Placeholder | Why |
|--------------|-------------|-----|
| Images (icons, avatars, screenshots) | `<SkeletonLoader />` with shimmer | Visual elements need shimmer |
| Titles/Names (app name, profile name) | `<SkeletonLoader />` with shimmer | Primary text hierarchy needs shimmer |
| Body text, descriptions, secondary text | `gray33` colored container | NO shimmer — static background |

### SkeletonLoader Component

Location: `src/lib/components/SkeletonLoader.svelte`

Fills its parent container. The parent defines size, shape, and `overflow-hidden`.

When to use: app icons, profile pictures, screenshots, fetched titles.
When NOT to use: section headers, body text, descriptions, paragraphs (use `gray33` container).

### Title Skeleton Sizes

| Font size | Container height |
|-----------|-----------------|
| text-4xl+ | `h-10` or `h-12` |
| text-xl/2xl | `h-7` or `h-8` |
| text-lg | `h-6` |
| text-base | `h-5` |

Always use `rounded-xl` (12px) for text skeleton containers.

### Complete Example

```svelte
<div class="flex gap-4 p-4">
  <!-- App icon — SKELETON -->
  <div class="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0">
    <SkeletonLoader />
  </div>
  <div class="flex-1 flex flex-col gap-2">
    <!-- App name — SKELETON -->
    <div class="w-32 h-6 rounded-xl overflow-hidden"><SkeletonLoader /></div>
    <!-- Developer name — GRAY33 -->
    <div class="w-24 h-4 rounded-lg" style="background-color: hsl(var(--gray33));"></div>
    <!-- Description — GRAY33 -->
    <div class="w-full h-4 rounded-lg" style="background-color: hsl(var(--gray33));"></div>
  </div>
</div>
```

### Technical Details

- Animation: 1.2s ease-in-out infinite shimmer
- Gradient: `transparent → white4 → white8 → white16 → white8 → white4 → transparent`
- GPU-accelerated via CSS transforms
- `role="status"` and `aria-label="Loading..."` for accessibility
- Respects `prefers-reduced-motion`

---

## Selector Component

Location: `src/lib/components/Selector.svelte`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `options` | string[] | Options to display |
| `selectedOption` | string | Currently selected option |
| `onSelect` | function | Callback receiving selected option |

### Styling

- Container: `gray33` bg, `rounded-2xl`
- Selected: `.btn-primary-small`
- Unselected: `.btn-secondary-small`
- Layout: flexbox, `gap-2`, equal-width (`flex-1`)

```svelte
<Selector
  options={["Forum", "Articles", "Events", "Apps"]}
  selectedOption={selectedTab}
  onSelect={(tab) => handleTabSelect(tab)}
/>
```

All tab/option selectors MUST use this component. No custom selector implementations.

---

## ProfilePic Component

Location: `src/lib/components/ProfilePic.svelte`

All profile pictures MUST use this component.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `pictureUrl` | string \| null | `null` | Profile picture URL |
| `name` | string \| null | `null` | Display name (initial fallback, color gen) |
| `pubkey` | string \| null | `null` | Hex pubkey (color gen) |
| `size` | `'xs'\|'sm'\|'md'\|'lg'\|'xl'\|'2xl'` | `'md'` | Size preset |
| `onClick` | function | `() => {}` | Click handler |
| `className` | string | `''` | Additional CSS classes |

### Size Reference

| Size | Pixels | Use Case |
|------|--------|----------|
| `xs` | 20px | Inline mentions, compact lists |
| `sm` | 28px | Comment input, small avatars |
| `md` | 38px | Default — comments, cards, lists |
| `lg` | 48px | Header, forum posts, testimonials |
| `xl` | 64px | Profile cards, featured content |
| `2xl` | 96px | Profile page header |

### Fallback Behavior

1. Has image URL → shows image with skeleton during load
2. No image, has name → colored initial letter
3. No image, no name, has pubkey → colored user icon
4. Nothing → gray user icon

### Display Rules

- Never feed raw hex pubkey as display name — pass `name={realNameOrNull}` so component shows icon fallback
- When no profile name loaded, show middle-trimmed npub: `npub1` + 3 chars + `......` + last 6 chars
- Never display raw hex as name or avatar source

### Color Generation

- From pubkey: `hexToColor()` → consistent color
- From name: `stringToColor()` → color from string
- Background: profile color at 24% opacity
- Text/Icon: adjusted via `getProfileTextColor()` for readability

---

## AppPic Component

Location: `src/lib/components/AppPic.svelte`

All app icons MUST use this component.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `iconUrl` | string \| null | `null` | App icon URL |
| `name` | string \| null | `null` | App name (initial fallback, color gen) |
| `identifier` | string \| null | `null` | App identifier/dTag (color gen) |
| `size` | `'xs'\|'sm'\|'md'\|'lg'\|'xl'\|'2xl'` | `'md'` | Size preset |
| `fillBackground` | boolean | `true` | Blurred background for transparent icons |
| `onClick` | function | `() => {}` | Click handler |
| `className` | string | `''` | Additional CSS classes |

### Size Reference

| Size | Pixels | Border Radius | Use Case |
|------|--------|---------------|----------|
| `xs` | 32px | 8px | Compact lists |
| `sm` | 38px | 8px | Small app lists |
| `md` | 48px | 16px | Default — cards, search |
| `lg` | 56px | 16px | Featured apps, detail views |
| `xl` | 72px | 24px | App detail header |
| `2xl` | 96px | 24px | Large feature displays |

### Blurred Background

Handles transparent/padded Android icons by rendering a blurred, scaled-up copy behind the icon. Uses `filter: blur(20px) saturate(1.5)`, scaled to 140%, 80% opacity. Controlled by `fillBackground` prop.

### Fallback Behavior

1. Has icon URL → image with skeleton during load
2. No icon, has name → colored initial letter
3. No icon, no name, has identifier → colored app icon
4. Nothing → gray generic app icon

### Difference from ProfilePic

| Feature | ProfilePic | AppPic |
|---------|------------|--------|
| Shape | Circle | Rounded square |
| Border radius | Fixed (50%) | Size-dependent (8/16/24px) |
| Color source | Pubkey or name | Identifier or name |

---

## Horizontal Scroll Containers

All horizontally scrolling elements MUST have edge fade effects.

### Edge Fade Pattern

```css
.horizontal-scroll {
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(to right, transparent 0%, black 1rem, black calc(100% - 1rem), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 1rem, black calc(100% - 1rem), transparent 100%);
}
.horizontal-scroll::-webkit-scrollbar { display: none; }
```

Fade distance MUST match container padding. Update at breakpoints if padding changes.

### wheelScroll Action

Location: `src/lib/actions/wheelScroll.js`

All horizontal scroll containers MUST use `use:wheelScroll`. Converts vertical mouse wheel to horizontal scroll on desktop (≥768px). Disabled on mobile.

```svelte
<script>
  import { wheelScroll } from "$lib/actions/wheelScroll.js";
</script>
<div class="horizontal-scroll" use:wheelScroll>
  <!-- items -->
</div>
```

---

## Timestamp Component

Location: `src/lib/components/common/Timestamp.svelte`

All timestamps MUST use this component.

### Display Logic

| Time | Display |
|------|---------|
| < 1 minute | Just Now |
| Today | Today HH:MM |
| Yesterday | Yesterday |
| Older | Mon D |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `timestamp` | number \| string \| Date \| null | `null` | Unix timestamp (s or ms), ISO string, or Date |
| `size` | `'xs'\|'sm'\|'md'` | `'sm'` | Font size (12px, 14px, 16px) |
| `className` | string | `''` | Additional CSS classes |

Handles all timestamp formats (seconds, milliseconds, ISO strings, Date objects) automatically.

---

## Image Containers

### Standard Specs

| Property | Value |
|----------|-------|
| Border radius | 12px (mobile), 16px (desktop) |
| Border | `0.33px solid hsl(var(--white16))` |
| Background | `hsl(var(--gray33))` |
| Hover effects | None (no outline changes) |

### Lightbox/Carousel

- Backdrop: `bg-overlay` class (not custom rgba)
- Image radius: 8px mobile, 16px desktop
- Border: `0.33px solid hsl(var(--white16))`
- Nav buttons: 40px circle, `white16` bg, `white33` hover
- Left/right chevrons offset 1px for visual centering
- Dot indicators: 8px diameter, below image. No counter text.

---

## Modal Component

Location: `$lib/components/Modal.svelte`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | boolean | `false` | Visibility (`bind:open`) |
| `align` | `'center'\|'bottom'\|'top'` | `'center'` | Alignment mode |
| `maxHeight` | number | `80` | Max height (vh) |
| `fillHeight` | boolean | `false` | Force fixed height to maxHeight |
| `maxWidth` | string | `'max-w-lg'` | Tailwind max-width (ignored when `wide`) |
| `wide` | boolean | `false` | Match page container width |
| `zIndex` | number | `50` | Z-index |
| `class` | string | `''` | CSS overrides |

### Alignment Behavior

- **Center** (default): centered, hugs content, switches to bottom if exceeds maxHeight
- **Bottom**: anchored to bottom, top radius only (sheet-style)
- **Top**: drops from top, bottom radius only
- On mobile (<640px): auto-switches to bottom
- `fillHeight={true}`: force fill to maxHeight

Use `align="bottom"` for dynamic/loading content to prevent jumping.

### Styling

- Background: `hsl(var(--gray66))`, radius: 32px
- Content padding: 16px mobile, 24px desktop (`p-4 md:p-6`)

### Button Rules in Modals

- Use `-large` button variants
- Secondary buttons: add `.btn-secondary-modal` (black33 bg, white66 text)

---

## EmptyState Component

Location: `src/lib/components/common/EmptyState.svelte`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `message` | string | Text to display |
| `minHeight` | number \| string | Optional minimum height |

Styling: `gray16` bg, `white16` text, 1.5rem font-weight 600, `radius-16`.

```svelte
<EmptyState message="No published apps" />
<EmptyState message="No comments yet" minHeight={600} />
```

---

## URL Display

When displaying URLs as visible text, never show protocol or trailing slash. Use `stripUrlForDisplay()` from `$lib/utils/url.js` for link text; keep full URL in `href`.

```svelte
<a href={app.repository} target="_blank" rel="noopener noreferrer">
  {stripUrlForDisplay(app.repository)}
</a>
```
