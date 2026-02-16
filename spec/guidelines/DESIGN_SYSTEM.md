---
description: Design system — panels, buttons, icons, colors, typography, components, loading states
globs: "**/*.svelte,**/*.css,**/app.css"
alwaysApply: false
---

# Design System & Development Rules

**This document contains all design system rules and standards for this project. LLMs and developers MUST follow these rules when working on this codebase.**

---

## Table of Contents

1. [Panels (Basic Containers)](#panels-basic-containers)
2. [Button Standards](#button-standards)
3. [Icon Standards](#icon-standards)
4. [Loading States & Skeleton Loader](#loading-states--skeleton-loader)
5. [Color System](#color-system)
6. [Typography](#typography)
7. [Borders & Outlines](#borders--outlines)
8. [Dividers](#dividers)
9. [Selector Component](#selector-component)
10. [Profile Picture Component](#profile-picture-component)
11. [App Picture Component](#app-picture-component)
12. [Responsive Sizing Pattern](#responsive-sizing-pattern)
13. [Horizontal Scroll Containers](#horizontal-scroll-containers)
14. [Timestamp Component](#timestamp-component)
15. [Image Containers](#image-containers)
16. [Modals](#modals)
17. [Empty State Component](#empty-state-component)
18. [URL Display](#url-display)

---

## Panels (Basic Containers)

### Overview

**CRITICAL RULE**: Panels are the most basic container element in this design system. They are used for cards, sections, and any grouped content. **Panels have NO border by default** - only a solid background color.

### Panel Specs

- **Background**: `gray66` (default), `white16` (light), `black33` (dark)
- **Border radius**: 16px (`var(--radius-16)`)
- **Padding**: 16px default (variants: 12px, 20px, 24px)
- **Border**: NONE by default

### Available Classes

#### Base Panel
- `.panel` - Default panel with gray66 background, 16px radius, 16px padding

#### Color Variants (add to `.panel`)
- `.panel-light` - Light variant with white16 background
- `.panel-dark` - Dark variant with black33 background

#### Padding Variants (add to `.panel`)
- `.panel-p-12` - 12px padding
- `.panel-p-16` - 16px padding (default)
- `.panel-p-20` - 20px padding
- `.panel-p-24` - 24px padding

#### Clickable Panels
- `.panel-clickable` - Adds hover/active scale effects for interactive panels

### Usage Examples

```svelte
<!-- Default panel -->
<div class="panel">
  Content here
</div>

<!-- Light panel with more padding -->
<div class="panel panel-light panel-p-24">
  Content here
</div>

<!-- Dark clickable panel -->
<div class="panel panel-dark panel-clickable" on:click={handleClick}>
  Interactive content
</div>

<!-- Clickable panel as link -->
<a href="/somewhere" class="panel panel-clickable">
  Click to navigate
</a>
```

### Clickable Panel Behavior

The `.panel-clickable` class adds:
- `cursor: pointer`
- Focus: 2px primary outline for accessibility

**NOTE**: Clickable panels do NOT have scale effects. See "Hover Scale Effects" section for what elements should scale on hover.

### When to Use Each Variant

| Variant | Use Case |
|---------|----------|
| `.panel` (gray66) | Default containers, cards, sections |
| `.panel-light` (white16) | Content on dark backgrounds, subtle elevation |
| `.panel-dark` (black33) | Content that needs more depth, overlays |
| `.panel-clickable` | Any panel that navigates or triggers an action |

### Important Notes

1. **Never add borders to panels** — Do not add a `border` property to panels or panel-like containers (cards, announcement boxes, hero side panels, etc.). No `border: 0.33px solid ...` or any other border. Use background color only. Add a border only when a special case explicitly requires it.
2. **Always use panel classes** for container elements - don't create custom card styles
3. **Clickable elements MUST have `cursor: pointer`** - this is enforced by `.panel-clickable`
4. Use Tailwind utilities for additional spacing (margin, gap) as needed

---

## Button Standards

### Overview

**CRITICAL RULE**: This project uses standardized button classes for ALL buttons across the site. **All buttons MUST use these standardized classes** - no custom button styles are allowed.

### Available Button Types

#### Primary Buttons (Blurple Gradient)
- `.btn-primary-large` - Large primary button (42px desktop, 38px mobile, 16px font)
- `.btn-primary` - Default primary button (~38px height, 16px font)
- `.btn-primary-small` - Small primary button (32px height, 14px font, pill shape)
- `.btn-primary-xs` - Extra small primary button (24px height, 12px font, pill shape)

#### Secondary Buttons (Gray66 Background)
- `.btn-secondary-large` - Large secondary button (42px desktop, 38px mobile, 16px font)
- `.btn-secondary` - Default secondary button (~38px height, 16px font)
- `.btn-secondary-small` - Small secondary button (32px height, 14px font, pill shape)
- `.btn-secondary-xs` - Extra small secondary button (24px height, 12px font, pill shape)

#### Glass Buttons (Backdrop Blur with Border)
- `.btn-glass-large` - Large glass button (42px desktop, 38px mobile, 16px font)
- `.btn-glass` - Default glass button (~38px height, 16px font)
- `.btn-glass-small` - Small glass button (32px height, 14px font)
- `.btn-glass-xs` - Extra small glass button (24px height, 12px font, pill shape)

**Note**: Large buttons (`-large` variants) scale down from 42px to 38px on mobile (<768px) for a more compact layout.

#### Glass Buttons (Backdrop Blur with Border)
- `.btn-glass-large` - Large glass button (~42px height, 16px font)
- `.btn-glass` - Default glass button (~38px height, 16px font)
- `.btn-glass-small` - Small glass button (32px height, 14px font, pill shape)
- `.btn-glass-xs` - Extra small glass button (24px height, 12px font, pill shape)

#### Glass Button Chevron Variant
- `.btn-glass-with-chevron` - Modifier class for glass buttons with chevron icons
  - Reduces right padding for better visual balance
  - Adds 12px gap between text and chevron
  - Available for `.btn-glass-large` and `.btn-glass` sizes
  - **Standard chevron styling**: Use `ChevronRight` icon with `color="hsl(var(--white33))"` and `size={18}`

### Usage Rules

1. **ALWAYS use standardized button classes** - Never create custom button styles

2. **NEVER use outlines or borders on buttons** - Buttons should not have visible outlines or borders unless specifically required for a special case. This includes:
   - No `border` property
   - No `outline` property  
   - No `box-shadow` used as border
   - Exception: Glass buttons use a subtle `white8` border for the frosted effect

3. **CRITICAL: Primary CTA Button Sizing Rules**:
   - **Landing page (`/` route)**: All primary CTAs MUST use `.btn-primary-large` at all screen sizes (always large)
   - **Desktop (≥768px)**: All primary CTAs MUST use `.btn-primary-large` 
   - **Mobile (<768px)**: Primary CTAs on non-landing pages should use `.btn-primary` (default size)
   - Use responsive classes: `btn-primary-large md:btn-primary-large` for landing page, `btn-primary md:btn-primary-large` for other pages

3. **Choose the appropriate size** based on context:
   - Large: Hero sections, primary CTAs (desktop), landing page CTAs (all sizes)
   - Default: Standard actions, forms, primary CTAs on mobile (non-landing pages)
   - Small: Secondary actions, compact spaces
   - Extra Small: Dense UIs, inline actions

4. **Choose the appropriate type**:
   - Primary: Main actions, important CTAs (blurple gradient)
   - Secondary: Secondary actions, alternative options (gray66 background)
   - Glass: Overlays, hero sections, transparent backgrounds (backdrop blur)

5. **Add utility classes as needed**:
   - `w-full` for full-width buttons
   - `disabled:opacity-70 disabled:cursor-not-allowed` for disabled states
   - `group` for hover effects on child elements
   - Gap utilities for spacing icons/text

6. **Glass buttons with chevrons**:
   - Use `.btn-glass-with-chevron` modifier class (available for `.btn-glass-large` and `.btn-glass`)
   - Always use `ChevronRight` icon with standard styling: `color="hsl(var(--white33))"` and `size={18}`
   - Add `group` class for chevron hover animation
   - Add mouse tracking handler (`on:mousemove`) for glass reflection effect (see examples)

### Examples

```svelte
<!-- Landing page CTA (always large) -->
<button class="btn-primary-large w-full">Get Started</button>

<!-- Other pages CTA (large on desktop, default on mobile) -->
<button class="btn-primary md:btn-primary-large w-full">Download</button>

<!-- Standard primary button (non-CTA) -->
<button class="btn-primary">Click me</button>

<!-- Glass button with chevron (standard pattern) -->
<script>
  import { ChevronRight } from "$lib/components/icons";
  
  let buttonElement;
  
  function handleMouseMove(event) {
    if (!buttonElement) return;
    const rect = buttonElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    buttonElement.style.setProperty("--mouse-x", `${mouseX}px`);
    buttonElement.style.setProperty("--mouse-y", `${mouseY}px`);
  }
</script>

<button
  bind:this={buttonElement}
  class="btn-glass-large btn-glass-with-chevron flex items-center group"
  on:mousemove={handleMouseMove}
>
  Discover Apps
  <ChevronRight
    variant="outline"
    color="hsl(var(--white33))"
    size={18}
    className="transition-transform group-hover:translate-x-0.5"
  />
</button>

<!-- Glass button without chevron -->
<button class="btn-glass">Learn More</button>

<!-- Disabled button -->
<button class="btn-primary" disabled>Processing...</button>
```

### Special Cases

Some components have specialized button styles that are exceptions:
- `.split-button-*` - SplitButton component (combines two buttons with dropdown)
- `.search-bar-btn` - Search bar input button
- `.profile-avatar-btn` - Profile avatar button

These are acceptable exceptions, but new components should use standardized button classes.

### Implementation Notes

- **All buttons MUST have `cursor: pointer`** - This is enforced in the CSS classes
- All buttons include hover and active scale effects
- Primary buttons have glow effects on hover
- Border radius: 16px for large/default, 9999px (pill) for small/xs
- All buttons use consistent transform transitions
- Glass buttons use `backdrop-blur-lg` for the blur effect
- Glass buttons have `white4` background (4% opacity) for subtle depth
- Glass buttons with chevrons include a cursor-following reflection effect (blurred white circle)
- Chevron hover animation: slides right slightly on button hover (`group-hover:translate-x-0.5`)

---

## Icon Standards

### Overview

This project uses a custom SVG icon system with components stored in `src/lib/components/icons/`. Icons support both fill and outline variants with configurable stroke widths.

### Icon Storage Location

**All custom icon components go in:** `src/lib/components/icons/`

Each icon gets its own Svelte component file (`.svelte`) in this directory.

### Creating a New Icon Component

1. **Export SVG from Figma** with these settings:
   - Format: SVG
   - Include "id" attribute: OFF
   - Outline stroke: ON (if you want outline variants)
   - Simplify stroke: OFF (to preserve paths)

2. **Create a new component** in `src/lib/components/icons/`:
   ```svelte
   <!-- ArrowDown.svelte -->
   <script>
     import BaseIcon from "./BaseIcon.svelte";
     
     export let variant = "outline"; // Default to outline
     export let strokeWidth = 1.4; // Default stroke width
     export let color = "hsl(var(--foreground))";
     export let size = 24;
     export let className = "";
   </script>
   
   <BaseIcon {variant} {strokeWidth} {color} {size} {className}>
     <svg
       width={size}
       height={size}
       viewBox="0 0 8 14"
       fill={variant === "fill" ? color : "none"}
       stroke={variant === "outline" ? color : "none"}
       stroke-width={variant === "outline" ? strokeWidth : 0}
       stroke-linecap="round"
       stroke-linejoin="round"
       xmlns="http://www.w3.org/2000/svg"
     >
       <path d="..." />
     </svg>
   </BaseIcon>
   ```

3. **Export from index** (for easier imports):
   ```js
   // src/lib/components/icons/index.js
   export { default as ArrowDown } from './ArrowDown.svelte';
   ```

### Icon Props

All icon components accept these props:

- `variant`: `"fill"` | `"outline"` (default: `"outline"` for most icons)
- `strokeWidth`: `1.4` | `2.8` (default: `1.4`, only applies to outline variant)
- `color`: CSS color value (default: `"hsl(var(--foreground))"`)
- `size`: number in pixels (default: `24`)
- `className`: Additional CSS classes (note: uses `className` instead of `class`)

### Usage Examples

```svelte
<!-- Outline icon (default, 1.4px stroke) -->
<ChevronRight variant="outline" color="hsl(var(--white16))" size={20} />

<!-- Fill icon -->
<Download variant="fill" color="hsl(var(--white66))" size={24} />

<!-- With custom classes -->
<ChevronLeft variant="outline" color="hsl(var(--white33))" size={20} className="transition-transform group-hover:translate-x-0.5" />
```

### Color Reference

Common CSS variables for icons:
- `hsl(var(--foreground))` - Default text color
- `hsl(var(--white8))` - Very subtle (8% opacity white)
- `hsl(var(--white11))` - Dividers (11% opacity white)
- `hsl(var(--white16))` - Subtle borders (16% opacity white)
- `hsl(var(--white33))` - Medium (33% opacity white)
- `hsl(var(--white66))` - Strong (66% opacity white)
- `hsl(var(--primary))` - Primary accent color
- `hsl(var(--muted-foreground))` - Muted text

### Best Practices

1. **Default to outline variant** - Most icons should default to `variant="outline"`
2. **Use 1.4px stroke width** - Standard stroke width for most icons
3. **Consistent sizing**: Use standard sizes (16, 20, 24, 32px)
4. **Color**: Always use CSS variables for theme consistency
5. **Stroke width**: Use 1.4px for small icons (<24px), 2.8px for larger icons if needed

### Fallback to Lucide Icons

**You can fall back to `lucide-svelte` icons** if you don't have a custom icon yet:

```svelte
import { Download, Search, User } from "lucide-svelte";
<Download class="h-5 w-5" />
```

**When to use custom icons vs Lucide:**
- ✅ **Custom icons**: Brand-specific icons, unique designs from Figma, chevrons/navigation
- ✅ **Lucide icons**: Generic UI icons for quick prototyping (gradually replace with custom)

---

## Loading States & Skeleton Loader

### Overview

**CRITICAL**: This section defines how to build loading states for feeds, screens, and any content that is fetched from Nostr or APIs.

**Minimum border radius**: All loading placeholder containers use at least `rounded-xl` (12px) border radius.

### The 100ms Rule

**Loading UI MUST only appear after a 100ms delay.** Before that, the screen should be empty/blank.

This prevents flickering for fast loads and only shows loading UI when actually needed.

```svelte
<script>
  import { onMount } from "svelte";
  
  let showLoadingUI = false;
  let isLoading = true;
  
  onMount(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        showLoadingUI = true;
      }
    }, 100);
    
    return () => clearTimeout(timer);
  });
</script>

{#if isLoading}
  {#if showLoadingUI}
    <!-- Loading UI here -->
  {/if}
{:else}
  <!-- Actual content -->
{/if}
```

### Building Loading UIs: Two Types of Placeholders

Loading states use a **mix** of two placeholder types:

| Content Type | Placeholder | Why |
|--------------|-------------|-----|
| **Images** (icons, avatars, screenshots) | `<SkeletonLoader />` with shimmer | Visual elements need shimmer to show "loading" |
| **Titles/Names** (app name, profile name, article title) | `<SkeletonLoader />` with shimmer | Primary text hierarchy needs shimmer |
| **Body text, descriptions, secondary text** | `gray33` colored container | NO shimmer - use static gray33 background |

**CRITICAL**: Body text and descriptions get `gray33` containers, NOT skeleton loaders!

### Skeleton Loader Component

**Location**: `src/lib/components/SkeletonLoader.svelte`

The `SkeletonLoader` fills its parent container. The **parent element** defines:
- Size (`width`, `height`)
- Shape (`border-radius`)
- `overflow-hidden` to clip the shimmer effect

**When to use SkeletonLoader**:
- ✅ App icons, profile pictures, screenshots (images)
- ✅ App Name, Article Title, Profile Name (fetched titles)
- ❌ Section headers (static UI text)
- ❌ Body text / descriptions (use gray33 container instead)
- ❌ Paragraphs

### Gray33 Placeholder Containers

For body text, descriptions, and secondary content - use simple `gray33` background containers:

```svelte
<!-- Description placeholder (NO shimmer) -->
<div class="w-full h-4 rounded-lg" style="background-color: hsl(var(--gray33));"></div>
```

### Complete Feed/Screen Loading Example

```svelte
<script>
  import { onMount } from "svelte";
  import SkeletonLoader from "$lib/components/SkeletonLoader.svelte";
  
  let showLoadingUI = false;
  let isLoading = true;
  
  onMount(() => {
    const timer = setTimeout(() => {
      if (isLoading) showLoadingUI = true;
    }, 100);
    return () => clearTimeout(timer);
  });
</script>

{#if isLoading && showLoadingUI}
  <!-- App Card Loading State -->
  <div class="flex gap-4 p-4">
    <!-- App icon - SKELETON -->
    <div class="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0">
      <SkeletonLoader />
    </div>
    
    <div class="flex-1 flex flex-col gap-2">
      <!-- App name (title) - SKELETON -->
      <div class="w-32 h-6 rounded-xl overflow-hidden">
        <SkeletonLoader />
      </div>
      
      <!-- Developer name (secondary) - GRAY33 -->
      <div class="w-24 h-4 rounded-lg" style="background-color: hsl(var(--gray33));"></div>
      
      <!-- Description lines - GRAY33 -->
      <div class="w-full h-4 rounded-lg" style="background-color: hsl(var(--gray33));"></div>
      <div class="w-3/4 h-4 rounded-lg" style="background-color: hsl(var(--gray33));"></div>
    </div>
  </div>
{/if}
```

### Title Skeleton Container Sizes

When using SkeletonLoader for titles, match the container height to the font:
- Large titles (text-4xl+): `h-10` or `h-12`
- Medium titles (text-xl/2xl): `h-7` or `h-8`
- Small titles (text-lg): `h-6`
- Default text (text-base): `h-5`

Always use `rounded-xl` (12px) for text skeleton containers.

### Technical Details

- **Animation**: 1.2s ease-in-out infinite shimmer
- **Gradient**: Extra-wide soft-feathered gradient (`transparent → white4 → white8 → white16 → white8 → white4 → transparent`)
- **Performance**: Uses CSS transforms for GPU acceleration
- **Accessibility**: Includes `role="status"` and `aria-label="Loading..."`
- **Reduced motion**: Respects `prefers-reduced-motion` media query

---

## Color System

### Preset Gradients (CSS Variables)

**CRITICAL**: Use the preset gradients from `src/app.css` for any gradient UI (buttons, icons, cards). Do not define new ad-hoc gradients.

| Variable | Use Case |
|----------|----------|
| `--gradient-blurple`, `--gradient-blurple-hover` | Primary CTAs, blurple accents |
| `--gradient-gold`, `--gradient-gold-hover`, `--gradient-gold66`, `--gradient-gold33`, `--gradient-gold16` | Gold accents (zaps, secondary actions) |
| `--gradient-gray`, `--gradient-gray-hover`, `--gradient-gray66`, `--gradient-gray33`, `--gradient-gray16` | Neutral/gray accents (send, muted actions) |
| `--gradient-rouge`, `--gradient-rouge-hover` | Destructive actions |
| `--gradient-green`, `--gradient-green-hover` | Success, confirmations |
| `--gradient-white-blurple`, `--gradient-white-gold`, etc. | Header/text gradients |

**Usage:** `background: var(--gradient-gold);` (or other preset). For SVG icons to show a gradient, use a wrapper div with the gradient as background and the icon as a CSS mask, or use the gradient’s color stops in an SVG `<linearGradient>`.

### Base Colors

The project uses HSL color variables defined in `src/app.css`:

- `--white`, `--white66`, `--white33`, `--white16`, `--white11`, `--white8`, `--white4` - White variants with opacity
- `--black`, `--black66`, `--black33`, `--black16`, `--black8` - Black variants with opacity
- `--gray`, `--gray66`, `--gray44`, `--gray33` - Gray variants with opacity
- `--blurpleColor`, `--blurpleColor66`, `--blurpleColor33` - Primary blurple color
- `--goldColor`, `--goldColor66` - Secondary gold color

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

### Semantic Colors

- `--background` - Page background
- `--foreground` - Primary text color
- `--card` - Card background (gray66)
- `--primary` - Primary accent (blurple)
- `--secondary` - Secondary accent (gold)
- `--muted-foreground` - Muted text
- `--border` - Border color (white16)

### Usage

Always use CSS variables:
```css
color: hsl(var(--foreground));
background-color: hsl(var(--card));
border-color: hsl(var(--white16));
```

### Profile Text Color Adjustment

**CRITICAL**: When displaying text in a user's profile color (author names, mentions, etc.), you MUST use `getProfileTextColor()` from `$lib/utils/color.js` to adjust the color for readability.

**Why?** Profile colors are generated for general use (backgrounds, avatars). When used as text color, they need brightness adjustment:
- **Dark mode**: Brighten by 8% for better readability on dark backgrounds
- **Light mode**: Darken by 5% for better contrast on light backgrounds

**How to use:**

```svelte
<script>
  import { onMount } from "svelte";
  import {
    hexToColor,
    stringToColor,
    getProfileTextColor,
    rgbToCssString,
  } from "$lib/utils/color.js";

  // Dark mode detection (required)
  let isDarkMode = true;
  onMount(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    isDarkMode = mediaQuery.matches;
    const handleChange = (e) => (isDarkMode = e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  });

  // Get base profile color
  $: baseColor = pubkey ? hexToColor(pubkey) : stringToColor(name);
  
  // Adjust for text readability
  $: textColor = getProfileTextColor(baseColor, isDarkMode);
  $: colorStyle = rgbToCssString(textColor);
</script>

<span style="color: {colorStyle};">{name}</span>
```

**Available functions in `$lib/utils/color.js`:**

| Function | Description |
|----------|-------------|
| `getProfileTextColor(rgb, isDarkMode)` | Adjusts profile color for text readability |
| `adjustColorBrightness(rgb, factor)` | Generic brightness adjustment (factor >1 brightens, <1 darkens) |
| `rgbToCssString(rgb)` | Converts RGB object to CSS `rgb()` string |

**DO NOT** use CSS `filter: brightness()` for this purpose - use the JavaScript function instead for consistency.

---

## Typography

### Font Families

- **Inter** (`--font-sans`) - Primary body and heading font (self-hosted)
- **JetBrains Mono** (`--font-mono`) - Code/monospace font (self-hosted)

**CSS Variables:**
```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Courier New', monospace;
```

**Usage:**
```css
font-family: var(--font-mono);  /* For code blocks */
font-family: var(--font-sans);  /* For body text */
```

### Code Syntax Highlighting (JSON)

Code blocks use proper JSON parsing with syntax highlighting:

| Element | Color Variable | Example |
|---------|---------------|---------|
| Keys | `--blurpleLightColor` | `"repository"` |
| Values (strings, numbers, bools) | `--foreground` | `"https://..."`, `123`, `true` |
| Punctuation (`:`, `"`, `,`) | `--white66` | `: " ,` |
| Curly braces `{}` | `--goldColor` | `{ }` |
| Square brackets `[]` | `--goldColor66` | `[ ]` |

**Example output:**
```
{
  "repository": "https://github.com/user/repo",
  "count": 42
}
```
Where `repository` is blurple, `https://...` is white, and punctuation is muted.

**Important:** Do NOT use monospace/code fonts for:
- npubs and nevents (these are identifiers, not code)
- User-facing IDs

Only use `--font-mono` for actual code content (JSON, programming languages, etc.)

### Font Sizes

- Display: `text-display-lg` (large headings)
- Body: Default 1.125rem (18px)
- Small: `text-sm` (14px)
- Extra Small: `text-xs` (12px)

### Font Weights

- 650 - Bold for large headings
- 600 - Semibold for smaller headings
- 500 - Medium for buttons and emphasis
- 400 - Regular for body text

---

## Borders & Outlines

### Overview

**CRITICAL RULE**: All borders and outlines in this design system MUST be **centered** (not inside or outside the element). This ensures visual consistency across all components.

### Border Specs

- **Thickness**: `0.33px` for thin element borders (ProfilePic, AppPic, cards, inputs)
- **Color**: Varies by context (see Border Colors table below)
- **Style**: Always `solid`

### Implementation

For thin borders on rounded elements, use the CSS `border` property:

```css
/* Standard element borders */
border: 0.33px solid hsl(var(--white16));

/* Overlay containers (modals, bottom bars) - more subtle */
border: 0.33px solid hsl(var(--white8));
```

### Border Colors

| Color | Use Case |
|-------|----------|
| `white8` | **Overlay containers** (modals, bottom bars, floating panels) - very subtle |
| `white16` | Default borders (cards, inputs, profile pics) |
| `white33` | Emphasized borders (focused inputs, highlighted elements) |
| `white11` | Dividers (see Dividers section) |

**Important**: Overlay containers like `Modal` and `BottomBar` use `white8` for their borders to keep them subtle and not compete with the content. Regular element borders (cards, inputs, profile pics) use `white16`.

### Important Rules

1. **Do NOT add borders to panels or panel-like containers** — Panels, cards, announcement boxes, and hero side panels must have NO border (see [Panels](#panels-basic-containers)). Use background color only.
2. **NEVER use borders thicker than 0.33px** for element outlines where a border is required (e.g. ProfilePic, AppPic, inputs — not panels)
3. **NEVER use `outline` property** for visual borders - use `border` instead
4. **ALWAYS use `hsl(var(--colorName))` syntax** for border colors

---

## Dividers

### Overview

Dividers are thin horizontal or vertical lines used to separate content sections. They provide visual hierarchy without adding heavy visual weight.

### Divider Specs

- **Thickness**: `1.4px` (both horizontal and vertical)
- **Color**: `white11` (11% white opacity)
- **No margins by default** - add spacing with wrapper elements or explicit margin

### Available Classes

```css
/* Horizontal divider */
.divider {
  width: 100%;
  height: 1.4px;
  background-color: hsl(var(--white11));
}

/* Vertical divider */
.divider-vertical {
  width: 1.4px;
  height: 100%;
  background-color: hsl(var(--white11));
}
```

### Usage Examples

```svelte
<!-- Simple horizontal divider -->
<div class="divider"></div>

<!-- Divider with margin -->
<div class="divider my-4"></div>

<!-- Vertical divider in a flex container -->
<div class="flex items-center gap-4">
  <span>Item 1</span>
  <div class="divider-vertical h-4"></div>
  <span>Item 2</span>
</div>
```

### Important Rules

1. **ALWAYS use `1.4px` height** for dividers - never 1px or other values
2. **ALWAYS use `white11` color** for dividers - never white16 or other values
3. **Use `.divider` class** when possible instead of custom styles
4. **For menu dividers**, add appropriate vertical margin (typically `12px 0`)

### Dividers vs Borders

| Element | Use |
|---------|-----|
| **Dividers** (`1.4px`, `white11`) | Content separation (between sections, menu items) |
| **Borders** (`0.33px`, `white16`) | Element outlines (cards, inputs, profile pics) |

---

## Selector Component

### Overview

The `Selector` component is a standardized tab/option selector used for filtering or switching between different views. It displays options as buttons with the selected option using primary button styling and unselected options using secondary button styling.

### Location

**Component file**: `src/lib/components/Selector.svelte`

### Usage

```svelte
<script>
  import Selector from "$lib/components/Selector.svelte";
  
  let selectedTab = "Forum";
  const tabs = ["Forum", "Articles", "Events", "Apps"];
  
  function handleTabSelect(tab) {
    selectedTab = tab;
    // Update content based on selection
  }
</script>

<Selector
  options={tabs}
  selectedOption={selectedTab}
  onSelect={handleTabSelect}
/>
```

### Props

- `options` (array, required): Array of option strings to display
- `selectedOption` (string, required): Currently selected option (must match one of the options)
- `onSelect` (function, required): Callback function called when an option is selected, receives the selected option as parameter

### Styling

- **Container**: `gray33` background color (`hsl(var(--gray33))`), fully rounded (`rounded-2xl`)
- **Selected option**: Uses `.btn-primary-small` class (blurple gradient)
- **Unselected options**: Uses `.btn-secondary-small` class (gray66 background)
- **Layout**: Flexbox with gap-2, equal-width buttons (`flex-1`)

### Examples

**Platform Selection:**
```svelte
<Selector
  options={["Android", "iOS", "Web"]}
  selectedOption={selectedPlatform}
  onSelect={(platform) => handlePlatformSelect(platform)}
/>
```

**Tab Navigation:**
```svelte
<Selector
  options={["Forum", "Articles", "Events", "Apps"]}
  selectedOption={selectedTab}
  onSelect={(tab) => handleTabSelect(tab)}
/>
```

### Standardization

**CRITICAL**: All tab/option selectors MUST use the `Selector` component. Do not create custom selector components. The existing `PlatformSelector` component has been updated to use `Selector` internally.

---

## Profile Picture Component

### Overview

**CRITICAL**: All profile pictures across the site MUST use the `ProfilePic` component. This ensures consistent styling, loading states, and fallback behavior.

### Location

**Component file**: `src/lib/components/ProfilePic.svelte`

### Features

- **Circular shape** with thin 0.33px outline (`hsl(var(--white16))`)
- **Skeleton loader** while image loads (uses `SkeletonLoader` component)
- **Colored initial fallback** when no image URL is provided - displays first letter of name in a colored background
- **Generic icon fallback** when neither image nor name is available
- **Color generation** from pubkey or name using `color.js` utilities
- **Hover/press states** with subtle scale transforms
- **Performance optimized** with lazy loading and CSS containment

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `pictureUrl` | `string \| null` | `null` | Profile picture URL |
| `name` | `string \| null` | `null` | Display name (used for initial letter fallback and color generation) |
| `pubkey` | `string \| null` | `null` | Hex pubkey (used for color generation) |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl'` | `'md'` | Size preset |
| `onClick` | `() => void` | `() => {}` | Click handler |
| `className` | `string` | `''` | Additional CSS classes |

### Size Reference

| Size | Pixels | Use Case |
|------|--------|----------|
| `xs` | 20px | Inline mentions, compact lists |
| `sm` | 28px | Comment input, small avatars |
| `md` | 38px | Default - comments, cards, lists |
| `lg` | 48px | Header, forum posts, testimonials |
| `xl` | 64px | Profile cards, featured content |
| `2xl` | 96px | Profile page header |

### Usage Examples

```svelte
<script>
  import ProfilePic from "$lib/components/ProfilePic.svelte";
</script>

<!-- Basic usage with image URL -->
<ProfilePic 
  pictureUrl="https://example.com/avatar.jpg" 
  name="Alice" 
  size="md" 
/>

<!-- With pubkey for color generation (Nostr profiles) -->
<ProfilePic 
  pictureUrl={profile?.picture}
  name={profile?.displayName || profile?.name}
  pubkey={profile?.pubkey}
  size="lg"
/>

<!-- Name only (shows colored initial letter) -->
<ProfilePic name="Bob" size="sm" />

<!-- Pubkey only (shows colored user icon) -->
<ProfilePic pubkey="abc123def456..." size="md" />

<!-- With click handler -->
<ProfilePic 
  name="Charlie" 
  size="lg"
  onClick={() => openProfile()}
/>

<!-- Profile page (large size) -->
<ProfilePic
  pictureUrl={developer?.picture}
  name={developer?.displayName || developer?.name}
  pubkey={developer?.pubkey}
  size="2xl"
/>
```

### Fallback Behavior

The component handles missing data gracefully:

1. **Has image URL**: Shows image with skeleton loader during load
2. **No image, has name**: Shows first letter of name on colored background
3. **No image, no name, has pubkey**: Shows user icon on colored background (color derived from pubkey)
4. **Nothing provided**: Shows gray user icon

### Color Generation

- **From pubkey**: Uses `hexToColor()` to generate a consistent color from the hex pubkey
- **From name**: Uses `stringToColor()` to generate a color from the name string
- **Background**: Profile color at 24% opacity
- **Text/Icon**: Profile color adjusted via `getProfileTextColor()` for readability (8% brighter in dark mode, 5% darker in light mode)

### Profile display (name and pic) — never raw hex

**CRITICAL**: Across the whole app:

- **Profile picture**: Never feed the raw hex pubkey as the display name for `ProfilePic`. The pic must show a **profile icon** (generic user icon) until a real display name is available. Pass `name={realNameOrNull}` so that when only the pubkey is known, `name` is `null` and the component shows the icon fallback.
- **Display name**: When no profile name is loaded, show the **middle-trimmed npub** (e.g. `npub149p......9g722q`), not the raw hex or a truncated hex. Use a consistent format: `npub1` + 3 characters + `......` + last 6 characters.
- **Summary**: Pic = icon until name is found; label = middle-trimmed npub until name is found. Never display raw hex as a name or as the source for the avatar initial.

### Standardization

**CRITICAL**: All profile pictures MUST use the `ProfilePic` component. Do not create custom avatar implementations. This includes:

- Header profile buttons
- Comment avatars
- Forum post authors
- Testimonial authors
- Profile page headers
- Zapper avatar lists
- Any other profile picture display

---

## App Picture Component

### Overview

**CRITICAL**: All app icons across the site MUST use the `AppPic` component. This ensures consistent styling, loading states, and fallback behavior for application icons.

### Location

**Component file**: `src/lib/components/AppPic.svelte`

### Features

- **Rounded square shape** with size-dependent border radius
- **Thin 0.33px outline** (`hsl(var(--white16))`)
- **Skeleton loader** while image loads (uses `SkeletonLoader` component)
- **Blurred background fill** for icons with transparency (Android icons with round shapes or padding)
- **Colored initial fallback** when no icon URL is provided - displays first letter of app name
- **Generic icon fallback** when neither icon nor name is available
- **Color generation** from identifier or name using `color.js` utilities
- **Hover/press states** with subtle scale transforms

### Blurred Background Feature

Many Android apps upload icons that don't fill the entire square - they may be circular with transparent corners, or have transparent padding around a centered logo. The `AppPic` component automatically handles this by:

1. Rendering the icon image with `object-fit: contain` (preserves aspect ratio)
2. Adding a blurred, scaled-up version of the same image behind it
3. The blurred background fills any transparent areas

This ensures **all app icons appear visually filled** without requiring manual processing.

**Technical implementation:**
- Blurred background uses CSS `filter: blur(20px) saturate(1.5)`
- Scaled to 140% to overflow and fill corners
- Opacity at 80% for subtle effect
- GPU-accelerated (no JavaScript computation)
- Controlled via `fillBackground` prop (default: `true`)

### Border Radius Rules

The border radius scales with size (matching Flutter implementation):

| Size (pixels) | Border Radius |
|---------------|---------------|
| >= 72px | 24px |
| >= 48px | 16px |
| < 48px | 8px |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `iconUrl` | `string \| null` | `null` | App icon URL |
| `name` | `string \| null` | `null` | App name (used for initial letter fallback and color generation) |
| `identifier` | `string \| null` | `null` | App identifier/dTag (used for color generation) |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl'` | `'md'` | Size preset |
| `fillBackground` | `boolean` | `true` | Show blurred background for transparent icons |
| `onClick` | `() => void` | `() => {}` | Click handler |
| `className` | `string` | `''` | Additional CSS classes |

### Size Reference

| Size | Pixels | Border Radius | Use Case |
|------|--------|---------------|----------|
| `xs` | 32px | 8px | Compact lists, inline mentions |
| `sm` | 38px | 8px | Small app lists |
| `md` | 48px | 16px | Default - app cards, search results |
| `lg` | 56px | 16px | Featured apps, detail views |
| `xl` | 72px | 24px | App detail header |
| `2xl` | 96px | 24px | Large feature displays |

### Usage Examples

```svelte
<script>
  import AppPic from "$lib/components/AppPic.svelte";
</script>

<!-- Basic usage with icon URL -->
<AppPic 
  iconUrl="https://example.com/app-icon.png" 
  name="Zapstore" 
  size="md" 
/>

<!-- With identifier for consistent color generation -->
<AppPic 
  iconUrl={app.icon}
  name={app.name}
  identifier={app.dTag}
  size="lg"
/>

<!-- Name only (shows colored initial letter) -->
<AppPic name="MyApp" size="sm" />

<!-- App detail page (large size) -->
<AppPic
  iconUrl={app.icon}
  name={app.name}
  identifier={app.identifier}
  size="xl"
/>

<!-- With click handler -->
<AppPic 
  name="Settings" 
  size="md"
  onClick={() => openApp()}
/>
```

### Fallback Behavior

The component handles missing data gracefully:

1. **Has icon URL**: Shows image with skeleton loader during load
2. **No icon, has name**: Shows first letter of name on colored background
3. **No icon, no name, has identifier**: Shows app icon on colored background (color derived from identifier)
4. **Nothing provided**: Shows gray generic app icon

### Color Generation

- **From identifier**: Uses `stringToColor()` to generate a consistent color from the app identifier/dTag
- **From name**: Uses `stringToColor()` to generate a color from the app name
- **Background**: App color at 24% opacity
- **Text/Icon**: Full app color

### Difference from ProfilePic

| Feature | ProfilePic | AppPic |
|---------|------------|--------|
| Shape | Circle | Rounded square |
| Border radius | Fixed (50%) | Size-dependent (8px/16px/24px) |
| Color source | Pubkey (hex) or name | Identifier or name |
| Use case | User avatars | App icons |

---

## Responsive Sizing Pattern

### Overview

**CRITICAL**: This pattern applies to all functional UI elements (feeds, cards, lists, headers, etc.) but NOT to landing page promotional/marketing sections which have their own custom responsive behavior.

### Two-Breakpoint System

Use exactly **two size categories** for responsive UI:

| Breakpoint | Name | Screen Width | Use Case |
|------------|------|--------------|----------|
| Mobile | Default | `< 768px` | Phones, small tablets |
| Desktop | `md:` | `>= 768px` | Tablets, laptops, desktops |

### Implementation

Always define mobile sizes first, then override for desktop using `@media (min-width: 768px)`:

```css
/* Mobile (default) */
.element {
  font-size: 0.875rem;
  padding: 12px;
}

/* Desktop */
@media (min-width: 768px) {
  .element {
    font-size: 1rem;
    padding: 16px;
  }
}
```

### Component Examples

#### SectionHeader
| Property | Mobile | Desktop |
|----------|--------|---------|
| Title font size | 1.25rem (20px) | 1.5rem (24px) |
| Chevron size | 16px | 14px |

#### AppSmallCard (in horizontal scroll)
| Property | Mobile | Desktop |
|----------|--------|---------|
| Icon size | 56px (lg) | 72px (xl) |
| Icon-to-text gap | 16px | 20px |
| Name font size | 0.875rem (14px) | 1rem (16px) |
| Description font size | 0.75rem (12px) | 0.875rem (14px) |
| Description lines | 1 | 2 |
| Column width | 280px | 320px |
| Card gap | 12px | 16px |

### When NOT to Apply

This pattern does NOT apply to:
- Landing page hero sections
- Marketing/promotional sections with custom animations
- Full-bleed visual elements
- Components in `src/lib/components/landing/` (these use their own responsive logic)

### Best Practices

1. **Mobile-first**: Always write mobile styles as the default
2. **Single breakpoint**: Use only the 768px breakpoint for functional UI
3. **Proportional scaling**: Desktop elements should be ~15-25% larger than mobile
4. **Test both sizes**: Always verify appearance at both breakpoints

---

## Horizontal Scroll Containers

### Overview

**CRITICAL**: All horizontally scrolling UI elements MUST have edge fade effects to indicate content continues beyond the visible area.

### Edge Fade Pattern

Use CSS `mask-image` with a linear gradient to fade content at the edges:

```css
.horizontal-scroll {
  overflow-x: auto;
  
  /* Hide scrollbar */
  scrollbar-width: none;
  -ms-overflow-style: none;
  
  /* Fade mask: opaque in center, transparent at edges */
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 1rem,
    black calc(100% - 1rem),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 1rem,
    black calc(100% - 1rem),
    transparent 100%
  );
}

.horizontal-scroll::-webkit-scrollbar {
  display: none;
}
```

### Alignment with Container Padding

When a scroll container extends beyond its parent (using negative margins with matching padding), the fade distance MUST match the padding:

```css
/* Example: Full-width scroll aligned with container content */
.horizontal-scroll {
  margin-left: -1rem;
  margin-right: -1rem;
  padding-left: 1rem;
  padding-right: 1rem;
  
  /* Fade matches padding */
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 1rem,
    black calc(100% - 1rem),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 1rem,
    black calc(100% - 1rem),
    transparent 100%
  );
}

/* Update at each breakpoint */
@media (min-width: 640px) {
  .horizontal-scroll {
    margin-left: -1.5rem;
    margin-right: -1.5rem;
    padding-left: 1.5rem;
    padding-right: 1.5rem;
    
    mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 1.5rem,
      black calc(100% - 1.5rem),
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 1.5rem,
      black calc(100% - 1.5rem),
      transparent 100%
    );
  }
}
```

### Usage Examples

- **App discovery feeds**: Horizontal scroll of app cards
- **Label/tag lists**: Scrollable labels in cards (see `ForumPost.svelte`)
- **Screenshot galleries**: Horizontal app screenshot carousels
- **Category chips**: Horizontally scrolling filter options

### Key Rules

1. **Always hide scrollbar**: Use `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`
2. **Always add fade mask**: Content should fade at the edges to indicate scrollability
3. **Match fade to padding**: The gradient transition distance should equal the container padding
4. **Update at breakpoints**: If padding changes at different screen sizes, update the mask gradient to match

### Mouse Wheel Scroll (wheelScroll Action)

**CRITICAL**: All horizontal scroll containers MUST use the `wheelScroll` Svelte action to enable mouse wheel scrolling on desktop.

**Location**: `src/lib/actions/wheelScroll.js`

**What it does:**
- Converts vertical mouse wheel scrolling to horizontal scrolling when the cursor is inside the element
- Allows normal page scrolling to resume when the horizontal scroll reaches its left/right edge
- Does NOT hijack vertical scrolling when the cursor merely passes over the element
- **Desktop only**: Automatically disabled on screens smaller than 768px

**Usage:**

```svelte
<script>
  import { wheelScroll } from "$lib/actions/wheelScroll.js";
</script>

<div class="horizontal-scroll" use:wheelScroll>
  <div class="scroll-content">
    <!-- Scrollable items -->
  </div>
</div>
```

**Behavior:**
- **Only activates on desktop (≥768px)** - disabled on mobile/tablet
- Only activates when the cursor is hovering inside the element
- When user scrolls with mouse wheel, content scrolls horizontally
- When content reaches left/right boundary, normal page scrolling resumes
- Works with both mouse wheel (`deltaY`) and horizontal trackpad gestures (`deltaX`)

**Where to apply:**
- All `.horizontal-scroll` containers
- Screenshot galleries
- Platform pill rows
- Tab button rows
- Any element with `overflow-x: auto` that users should be able to scroll with their mouse wheel

---

## Timestamp Component

### Overview

**CRITICAL**: All timestamps across the site MUST use the `Timestamp` component. This ensures consistent relative time display and formatting logic site-wide.

### Location

**Component file**: `src/lib/components/common/Timestamp.svelte`

### Display Logic

The `Timestamp` component uses this unified logic for displaying times:

| Time | Display | Example |
|------|---------|---------|
| &lt; 1 minute | Just Now | Just Now |
| Today | Today HH:MM | Today 14:30 |
| Yesterday | Yesterday | Yesterday |
| Older | Mon D | Jan 21 |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `timestamp` | `number \| string \| Date \| null` | `null` | Unix timestamp (seconds or ms), ISO string, or Date object |
| `size` | `'xs' \| 'sm' \| 'md'` | `'sm'` | Size variant for font size |
| `className` | `string` | `''` | Additional CSS classes |

### Size Reference

| Size | Font Size | Use Case |
|------|-----------|----------|
| `xs` | 12px (text-xs) | Chat bubbles, compact lists |
| `sm` | 14px (text-sm) | Default - comments, cards, forum posts |
| `md` | 16px (text-base) | Larger displays, headers |

### Usage Examples

```svelte
<script>
  import Timestamp from "$lib/components/Timestamp.svelte";
</script>

<!-- Basic usage with unix timestamp (seconds) -->
<Timestamp timestamp={1705312800} />

<!-- With unix timestamp (milliseconds) -->
<Timestamp timestamp={1705312800000} />

<!-- With ISO string -->
<Timestamp timestamp="2024-01-15T10:00:00Z" />

<!-- With Date object -->
<Timestamp timestamp={new Date()} />

<!-- Different sizes -->
<Timestamp timestamp={comment.createdAt} size="xs" />
<Timestamp timestamp={post.timestamp} size="sm" />
<Timestamp timestamp={article.publishedAt} size="md" />

<!-- With custom classes -->
<Timestamp timestamp={event.time} className="text-muted-foreground" />
```

### Standardization

**CRITICAL**: All timestamps MUST use the `Timestamp` component. Do not create custom timestamp formatting functions in components. This includes:

- Comment timestamps
- Forum post timestamps
- Article publish dates
- Event times
- Any other relative time display

The component handles all timestamp normalization (seconds, milliseconds, ISO strings, Date objects) automatically.

---

## Image Containers

### Overview

All image thumbnails in functional UI (not landing/promotional sections) should follow consistent styling rules for a unified look.

### Standard Image Container Specs

| Property | Value |
|----------|-------|
| Border radius | 12px (mobile), 16px (desktop) |
| Border | 0.33px solid `hsl(var(--white16))` |
| Background | `hsl(var(--gray33))` |
| Hover effects | None (no outline changes on hover/click) |

### Important Rules

1. **Thin outline only** - Use `0.33px solid hsl(var(--white16))` - no thick borders or hover state outlines
2. **No hover outline changes** - The outline should remain constant on hover/click
3. **Consistent with AppPic** - This matches the `AppPic` component styling for visual consistency
4. **Responsive border radius** - Use 12px on mobile, 16px on desktop (768px breakpoint)

### Example CSS

```css
.image-thumb {
  border-radius: 12px;
  background-color: hsl(var(--gray33));
  border: 0.33px solid hsl(var(--white16));
  overflow: hidden;
}

@media (min-width: 640px) {
  .image-thumb {
    border-radius: 16px;
  }
}
```

### Lightbox/Carousel

When displaying images in a full-screen lightbox:

**Backdrop:**
- Use `bg-overlay` class (same as modals) - NOT custom rgba colors
- This uses `hsl(var(--overlay))` which adapts to color scheme

**Image Container:**

| Property | Value |
|----------|-------|
| Border radius | 8px (mobile), 16px (desktop 768px+) |
| Border | 0.33px solid `hsl(var(--white16))` |
| Background | `hsl(var(--gray33))` |
| Loading state | Use `SkeletonLoader` component |

**Navigation:**

| Element | Spec |
|---------|------|
| Nav button size | 40px diameter circle |
| Nav button background | `hsl(var(--white16))` |
| Nav button hover | `hsl(var(--white33))` |
| Left chevron | Offset 1px to the left (padding-right: 1px) for visual centering |
| Right chevron | Offset 1px to the right (padding-left: 1px) for visual centering |
| Dot indicators | 8px diameter, positioned below the image (not overlaying) |
| Counter text | Do NOT show - only use dot indicators |

---

## Modals

Use the `Modal` component (`$lib/components/Modal.svelte`) for all modal dialogs.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | boolean | `false` | Controls modal visibility (use `bind:open`) |
| `align` | `'center'` \| `'bottom'` \| `'top'` | `'center'` | Force alignment mode |
| `maxHeight` | number | `80` | Max height as percentage of viewport (vh) |
| `fillHeight` | boolean | `false` | Force modal to fill to maxHeight (fixed height instead of hugging content) |
| `maxWidth` | string | `'max-w-lg'` | Tailwind max-width class (ignored when `wide` is true) |
| `wide` | boolean | `false` | Match page container width (640px→1100px at breakpoints) |
| `zIndex` | number | `50` | Z-index for stacking modals |
| `class` | string | `''` | Additional CSS classes for styling overrides |

### Alignment Behavior

- **Center** (default): Modal is centered, hugs content, switches to bottom-align if content exceeds `maxHeight`
- **Bottom**: Modal is anchored to bottom of screen with top border radius only (sheet-style). Hugs content up to `maxHeight`.
- **Top**: Modal drops from top with bottom border radius only (dropdown-style). Hugs content up to `maxHeight`.
- On mobile (<640px), modals automatically switch to bottom alignment (still hugs content)
- Use `fillHeight={true}` to force any modal to fill to `maxHeight` (fixed height)

### When to Force Bottom Alignment

Use `align="bottom"` when the modal contains:
- **Dynamic/loading content** (feeds, lists that load asynchronously)
- **Potentially tall content** that may exceed the viewport
- **Sheet-style UI patterns** (action sheets, pickers)

This prevents the modal from "jumping" when content loads and triggers the alignment switch.

```svelte
<!-- For modals with loading feeds/content (hugs content) -->
<Modal bind:open align="bottom" maxHeight={80}>
  <FeedContent />
</Modal>

<!-- For wide modals like comment threads (fixed height, matches page content width) -->
<Modal bind:open align="bottom" maxHeight={85} fillHeight={true} wide={true}>
  <ThreadContent />
</Modal>
```

### Styling

- Default background: `hsl(var(--gray66))`
- Border radius: `var(--radius-32)` (32px)
- **Content padding**: `16px` on mobile, `24px` on desktop (768px breakpoint)
- Use `class` prop to override background (e.g., `DownloadModal` uses gradient)

### Modal Content Padding

**CRITICAL**: All modal content containers MUST use responsive padding:
- **Mobile (<768px)**: `16px` padding
- **Desktop (≥768px)**: `24px` padding

```css
.modal-content {
  padding: 16px;
}

@media (min-width: 768px) {
  .modal-content {
    padding: 24px;
  }
}
```

Or with Tailwind: `class="p-4 md:p-6"`

### Button Usage in Modals

**CRITICAL**: Buttons inside modals follow specific rules:

1. **Use large button sizes** - All CTA and secondary buttons in modals should use `-large` variants:
   - Primary CTA: `btn-primary-large`
   - Secondary options: `btn-secondary-large`

2. **Secondary buttons use modal variant** - Secondary buttons in modals must use the `btn-secondary-modal` modifier class for proper contrast:
   - Background: `black33` (darker than default `gray66`)
   - Text color: `white66` (softer than default `foreground`)

```svelte
<!-- Primary CTA in modal -->
<button class="btn-primary-large w-full">
  Start
</button>

<!-- Secondary option in modal -->
<button class="btn-secondary-large btn-secondary-modal w-full">
  Already have an account?
</button>
```

This ensures proper visual hierarchy and contrast against the modal's `gray66` background.

---

## Hover Scale Effects

### Overview

**CRITICAL**: Scale effects on hover (growing/shrinking on interaction) are ONLY allowed on specific element types. Do NOT add scale effects to elements containing significant text content.

### Elements That SHOULD Have Scale Effects

| Element Type | Hover | Active | Why |
|--------------|-------|--------|-----|
| **Buttons** (all `.btn-*` classes) | `scale(1.02)` | `scale(0.98)` | Clear interactive feedback |
| **ProfilePic** component | `scale(1.04)` | `scale(0.96)` | Small, visual-only element |
| **AppPic** component | `scale(1.04)` | `scale(0.96)` | Small, visual-only element |
| **Clickable images in horizontal scroll** | `scale(1.02)` | `scale(0.98)` | Cards in carousels (e.g., app cards, screenshots) |

### Elements That Should NOT Have Scale Effects

| Element Type | Why |
|--------------|-----|
| **Panels** (`.panel-clickable`) | Contains text content that would distort |
| **Cards with text** (e.g., `AppStackCard`) | Text-heavy elements should not scale |
| **List items with descriptions** | Scaling text is distracting and looks broken |
| **Any container with paragraphs/descriptions** | Text should remain stable |

### Rule of Thumb

**If an element contains more than a name/label (i.e., has descriptions, paragraphs, or multiple lines of text), it should NOT scale on hover.**

Scale effects are for:
- Buttons (action triggers)
- Avatar/icon images (visual elements only)
- Small cards in carousels where the focus is the image

---

## General Rules

1. **Always use standardized classes** - Don't create custom styles for buttons, icons, or common UI elements
2. **Use CSS variables** - Always use design tokens (CSS variables) for colors, spacing, etc.
3. **Follow the design system** - Check this document before creating new components
4. **Document exceptions** - If you need a specialized component, document it here
5. **Consistency first** - Prefer reusing existing patterns over creating new ones
6. **Cursor pointer on clickable elements** - **ALL clickable elements MUST have `cursor: pointer`**. This includes buttons, links, cards that navigate, toggles, and any other interactive elements. Users must always have clear visual feedback that an element is clickable.
7. **Two-breakpoint responsive**: Use the mobile/desktop (768px) breakpoint pattern for all functional UI - see "Responsive Sizing Pattern" section

---

## Empty State Component

### Overview

Use the `EmptyState` component for consistent empty states (e.g. "No published apps", "No comments yet", "Labels coming soon"). By default it matches the discover page style (gray16 background, white16 text). The height can be overridden for tall areas (e.g. SocialTabs).

**Location**: `src/lib/components/common/EmptyState.svelte`

### Props

- `message` (string): Text to display (e.g. "No published apps").
- `minHeight` (number | string, optional): Minimum height (e.g. `600` for pixels or `"600px"`). Omit for default (no min height).

### Usage

```svelte
<EmptyState message="No published apps" />

<EmptyState message="No comments yet" minHeight={600} />
```

### Styling

- Background: `hsl(var(--gray16))`
- Text: `hsl(var(--white16))`, 1.5rem, font-weight 600
- Border radius: `var(--radius-16)`

---

## URL Display

**CRITICAL**: When displaying URLs as visible text (repository, website, release URL, etc.), **never** show the protocol or trailing slash. Use `stripUrlForDisplay()` from `$lib/utils/url.js` for the link text; keep the full URL in the `href` attribute.

**Example**: Display `github.com/user/repo` instead of `https://github.com/user/repo/`.

```svelte
import { stripUrlForDisplay } from '$lib/utils/url.js';
<a href={app.repository} target="_blank" rel="noopener noreferrer">{stripUrlForDisplay(app.repository)}</a>
```

---

## Maintenance

When adding new components or styles:

1. Check this document first
2. Use standardized classes and patterns
3. Never create custom button styles (use button classes)
4. Never create custom icon styles (use icon components)
5. Update this document if new standards are needed
6. Document any exceptions here

---

**Last Updated**: This document should be updated whenever new design system rules are established.

