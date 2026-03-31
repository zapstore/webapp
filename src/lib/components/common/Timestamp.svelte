<script>
  /**
   * Timestamp Component
   * Single source of truth for timestamp display across the site (bubbles, comments, zaps, testimonials).
   *
   * - "Just Now" for < 1 minute
   * - "Today HH:MM" for today
   * - "Yesterday" for yesterday
   * - "Jan 21" for all older dates
   */

  /**
   * @type {number|string|Date|null} - Unix timestamp (seconds or ms), ISO string, or Date object
   */
  import { SvelteDate } from "svelte/reactivity";
  export let timestamp = null;

  /**
   * @type {'xs'|'sm'|'md'} - Size variant
   */
  export let size = "sm";

  /**
   * @type {string} - Additional CSS classes
   */
  export let className = "";

  // Size classes mapping
  const sizeClasses = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-base",
  };

  /**
   * Normalizes various date inputs to a Date object
   * @param {number | string | Date | null} value
   * @returns {Date | null}
   */
  function normalizeToDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number") {
      // Heuristic: treat < 1e12 as unix seconds, otherwise milliseconds
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    if (typeof value === "string") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  /**
   * Formats the timestamp (matches TestimonialsSection and all bubbles)
   * @param {number|string|Date|null} input
   * @returns {string}
   */
  function formatTimestamp(input) {
    const date = normalizeToDate(input);
    if (!date) return "";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return "Just Now";

    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `Today ${hours}:${minutes}`;
    }

    const yesterday = new SvelteDate(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isYesterday) return "Yesterday";

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    return `${month} ${day}`;
  }

  $: displayTime = formatTimestamp(timestamp);
  $: sizeClass = sizeClasses[size] || sizeClasses.sm;
</script>

<time
  class="timestamp {sizeClass} {className}"
  datetime={normalizeToDate(timestamp)?.toISOString() || ""}
  style="color: hsl(var(--white33));"
>
  {displayTime}
</time>

<style>
  .timestamp {
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 2px;
  }
</style>
