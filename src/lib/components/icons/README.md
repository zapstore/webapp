# Icon System Documentation

## Overview

This icon system allows you to use custom SVG icons from Figma with flexible styling options:
- **Fill mode**: Solid filled icons
- **Outline mode**: Outlined icons with configurable stroke width (1.4px or 2.8px)
- **Color control**: Use CSS variables or custom colors

## Why SVG Components over Icon Fonts?

✅ **Better control**: Fill vs outline, variable stroke widths
✅ **Smaller bundle**: Only icons you use are included
✅ **Better performance**: No font loading, direct SVG rendering
✅ **Easier styling**: CSS variables work seamlessly
✅ **Type safety**: Component-based with TypeScript support

## Icon Storage Location

**All custom icon components go in:** `src/lib/components/icons/`

You don't "upload" SVG files directly. Instead, you create Svelte component files (`.svelte`) for each icon. Each icon gets its own component file in this directory.

## Setup: Exporting Icons from Figma

1. **Select your icon** in Figma
2. **Export as SVG** with these settings:
   - Format: SVG
   - Include "id" attribute: OFF
   - Outline stroke: ON (if you want outline variants)
   - Simplify stroke: OFF (to preserve paths)

3. **Optimize the SVG**:
   - Remove unnecessary attributes (like `id`, `class` from Figma)
   - Ensure paths use `fill` for filled icons
   - Ensure paths use `stroke` for outline icons
   - Set `stroke-linecap="round"` and `stroke-linejoin="round"` for better appearance

## Creating a New Icon Component

1. **Export SVG from Figma** (see above)

2. **Create a new component** in `src/lib/components/icons/`:
   ```svelte
   <!-- ArrowDown.svelte -->
   <script>
     import BaseIcon from "./BaseIcon.svelte";
     
   export let variant = "fill";
   export let strokeWidth = 1.4;
   export let color = "hsl(var(--foreground))";
   export let size = 24;
   export let className = "";
   </script>
   
   <BaseIcon {variant} {strokeWidth} {color} {size} {className}>
     <!-- Paste your SVG here, replacing fill/stroke with props -->
     <svg
       width={size}
       height={size}
       viewBox="0 0 24 24"
       fill={variant === "fill" ? color : "none"}
       stroke={variant === "outline" ? color : "none"}
       stroke-width={variant === "outline" ? strokeWidth : 0}
       stroke-linecap="round"
       stroke-linejoin="round"
     >
       <path d="M12 5v14M19 12l-7 7-7-7" />
     </svg>
   </BaseIcon>
   ```

3. **Export from index** (optional, for easier imports):
   ```js
   // src/lib/components/icons/index.js
   export { default as ArrowDown } from './ArrowDown.svelte';
   ```

## Usage Examples

### Fill Icon
```svelte
<script>
  import ArrowDown from '$lib/components/icons/ArrowDown.svelte';
</script>

<ArrowDown variant="fill" color="hsl(var(--white16))" size={24} />
```

### Outline Icon (1.4px stroke)
```svelte
<ArrowDown variant="outline" strokeWidth={1.4} color="hsl(var(--primary))" size={24} />
```

### Outline Icon (2.8px stroke)
```svelte
<ArrowDown variant="outline" strokeWidth={2.8} color="hsl(var(--primary))" size={24} />
```

### With CSS Variables
```svelte
<ArrowDown variant="fill" color="hsl(var(--white16))" size={20} className="hover:opacity-80" />
```

## Props

All icon components accept these props:

- `variant`: `"fill"` | `"outline"` (default: `"fill"`)
- `strokeWidth`: `1.4` | `2.8` (default: `1.4`, only applies to outline variant)
- `color`: CSS color value (default: `"hsl(var(--foreground))"`)
- `size`: number in pixels (default: `24`)
- `className`: Additional CSS classes (note: uses `className` instead of `class` since `class` is a reserved keyword)

## Color Reference

Common CSS variables you can use:
- `hsl(var(--primary))`
- `hsl(var(--foreground))`
- `hsl(var(--muted-foreground))`
- `hsl(var(--white16))`
- `hsl(var(--white33))`
- `hsl(var(--border))`

## Fallback to Lucide Icons

**You can always fall back to `lucide-svelte` icons** if you don't have a custom icon yet or need a quick solution:

```svelte
import { Download, Search, User } from "lucide-svelte";

<Download class="h-5 w-5" />
<Search class="h-4 w-4 text-primary" />
```

**When to use custom icons vs Lucide:**
- ✅ **Custom icons**: Brand-specific icons, unique designs from Figma
- ✅ **Lucide icons**: Generic UI icons (arrows, search, user, etc.), quick prototyping

Both can coexist in the same project. Gradually replace Lucide icons with custom ones as you create them.

## Migration from Lucide Icons

When replacing Lucide icons with custom ones:

**Before (Lucide):**
```svelte
import { Download } from "lucide-svelte";
<Download class="h-5 w-5" />
```

**After (Custom):**
```svelte
import Download from '$lib/components/icons/Download.svelte';
<Download variant="outline" strokeWidth={1.4} size={20} />
```

## Best Practices

1. **Consistent sizing**: Use standard sizes (16, 20, 24, 32px)
2. **Variant consistency**: Use fill for primary actions, outline for secondary
3. **Stroke width**: Use 1.4px for small icons (<24px), 2.8px for larger icons
4. **Color**: Always use CSS variables for theme consistency
5. **Optimization**: Keep SVG paths simple and clean

