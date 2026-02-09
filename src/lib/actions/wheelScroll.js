/**
 * Svelte action for horizontal scroll with mouse wheel.
 * 
 * When the user's cursor is inside a horizontally scrollable element
 * and they use the mouse wheel, it scrolls horizontally instead of vertically.
 * 
 * IMPORTANT: This action ALWAYS prevents vertical page scrolling when the
 * cursor is inside the horizontal scroll zone. This is intentional for
 * infinite scroll scenarios where more content may be loading at the edges.
 * 
 * Only activates when:
 * - Screen width is >= 768px (desktop only)
 * - The scroll starts within the element (cursor is inside)
 * - The element has horizontal overflow (can actually scroll)
 * 
 * Does NOT activate when:
 * - Screen is smaller than 768px (mobile/tablet)
 * - User is scrolling vertically and cursor just passes over the element
 * 
 * Usage:
 * <div use:wheelScroll class="horizontal-scroll">...</div>
 */

const DESKTOP_BREAKPOINT = 768;

/**
 * @param {HTMLElement} node - The scrollable element
 * @returns {Object} Svelte action lifecycle methods
 */
export function wheelScroll(node) {
  let isHovering = false;

  function onMouseEnter() {
    isHovering = true;
  }

  function onMouseLeave() {
    isHovering = false;
  }

  /** @param {WheelEvent} e */
  function onWheel(e) {
    // Disable on mobile/tablet screens
    if (window.innerWidth < DESKTOP_BREAKPOINT) return;
    
    // Only handle if cursor is inside the element
    if (!isHovering) return;
    
    // Check if the element has any horizontal overflow at all
    const hasHorizontalOverflow = node.scrollWidth > node.clientWidth;
    
    if (!hasHorizontalOverflow) return;
    
    // Get the scroll delta (handle both deltaY and deltaX)
    // deltaY is vertical wheel, deltaX is horizontal wheel/trackpad
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    
    if (delta === 0) return;
    
    // ALWAYS prevent vertical page scroll when inside horizontal scroll zone
    // This is crucial for infinite scroll - more content may be loading at edges
    e.preventDefault();
    
    // Calculate new scroll position, clamped to valid range
    const maxScroll = node.scrollWidth - node.clientWidth;
    const newScrollLeft = Math.max(0, Math.min(maxScroll, node.scrollLeft + delta));
    
    // Apply the horizontal scroll
    node.scrollLeft = newScrollLeft;
  }

  node.addEventListener('mouseenter', onMouseEnter);
  node.addEventListener('mouseleave', onMouseLeave);
  node.addEventListener('wheel', onWheel, { passive: false });

  return {
    destroy() {
      node.removeEventListener('mouseenter', onMouseEnter);
      node.removeEventListener('mouseleave', onMouseLeave);
      node.removeEventListener('wheel', onWheel);
    }
  };
}
