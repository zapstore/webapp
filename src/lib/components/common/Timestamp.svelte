<script>
  /**
   * Timestamp Component
   * Displays relative or formatted timestamps consistently across the site
   *
   * Single source of truth for timestamp display logic:
   * - "now" for < 1 minute
   * - "Xm ago" for < 1 hour
   * - "Xh ago" for < 24 hours
   * - "Xd ago" for < 7 days
   * - "Mon DD" for older dates in current year
   * - "Mon DD, YYYY" for dates in other years
   */

  /**
   * @type {number|string|Date|null} - Unix timestamp (seconds or ms), ISO string, or Date object
   */
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
   * Formats the timestamp as relative time or date
   */
  function formatTimestamp(input) {
    const date = normalizeToDate(input);
    if (!date) return "";

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Relative time for recent timestamps
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Formatted date for older timestamps
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const currentYear = now.getFullYear();

    if (year === currentYear) {
      return `${month} ${day}`;
    }
    return `${month} ${day}, ${year}`;
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
  }
</style>
