/**
 * Svelte action for horizontal scroll with mouse wheel.
 * 
 * When the user's cursor is inside a horizontally scrollable element
 * and they use the mouse wheel, it scrolls horizontally instead of vertically.
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

  function onWheel(e) {
    // Disable on mobile/tablet screens
    if (window.innerWidth < DESKTOP_BREAKPOINT) return;
    
    // Only handle if cursor is inside the element
    if (!isHovering) return;
    
    // Check if the element can scroll horizontally
    const canScrollLeft = node.scrollLeft > 0;
    const canScrollRight = node.scrollLeft < node.scrollWidth - node.clientWidth;
    const canScroll = canScrollLeft || canScrollRight;
    
    if (!canScroll) return;
    
    // Get the scroll delta (handle both deltaY and deltaX)
    // deltaY is vertical wheel, deltaX is horizontal wheel/trackpad
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    
    if (delta === 0) return;
    
    // Check if we're at the scroll boundary
    const atLeftEdge = node.scrollLeft <= 0 && delta < 0;
    const atRightEdge = node.scrollLeft >= node.scrollWidth - node.clientWidth - 1 && delta > 0;
    
    // If at boundary, let the page scroll normally
    if (atLeftEdge || atRightEdge) return;
    
    // Prevent the default vertical scroll
    e.preventDefault();
    
    // Scroll horizontally
    node.scrollLeft += delta;
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
