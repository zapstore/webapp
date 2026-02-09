/**
 * Color utility functions
 * Converts strings, file extensions, and Nostr npubs to colors
 * Based on Flutter implementation
 */

/**
 * Convert string to RGB color
 * @param {string} value - Input string
 * @returns {{r: number, g: number, b: number}} RGB color object
 */
export function stringToColor(value) {
  // Normalize any input string consistently
  const normalized = value.trim().toUpperCase();

  // Handle empty string deterministically
  if (normalized.length === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  // Convert string to BigInt using character codes (stable hashing)
  let number = BigInt(0);
  for (let i = 0; i < normalized.length; i++) {
    const charCode = BigInt(normalized.charCodeAt(i));
    const power = BigInt(256) ** BigInt(i);
    number = number + charCode * power;
  }

  // Get hue value between 0 and 359
  const hue = Number(number % BigInt(360));

  // Convert HSV to RGB
  const h = hue / 60;

  // Adjustments to make the color readable at all times
  const s = 0.7;
  const v =
    hue >= 32 && hue <= 204
      ? 0.7
      : hue >= 216 && hue <= 273
        ? 0.96
        : 0.9;

  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;

  let r, g, b;
  if (h < 1) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 2) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 3) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 4) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 5) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  // Convert RGB to integers
  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);

  return { r: red, g: green, b: blue };
}

/**
 * Convert string to hex color
 * @param {string} value - Input string
 * @returns {string} Hex color string (e.g., "#FF0000")
 */
export function stringToHexColor(value) {
  const color = stringToColor(value);
  return rgbToHex(color.r, color.g, color.b);
}

/**
 * Convert string to color integer (with alpha)
 * @param {string} value - Input string
 * @returns {number} Color integer (0xFFRRGGBB format)
 */
export function stringToColorInt(value) {
  const color = stringToColor(value);
  return (0xff << 24) | (color.r << 16) | (color.g << 8) | color.b;
}

/**
 * Convert hex string to RGB color
 * @param {string} hex - Hex string (without #)
 * @returns {{r: number, g: number, b: number}} RGB color object
 */
export function hexToColor(hex) {
  // Ensure hex string is valid
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) {
    // Return a default gray color if hex is invalid
    return { r: 128, g: 128, b: 128 };
  }

  const number = BigInt(`0x${hex}`);

  // Get hue value between 0 and 355
  const hue = Number(number % BigInt(360));

  // Convert HSV to RGB
  const h = hue / 60;

  // Adjustments to make the color readable at all times
  const s = 0.7;
  const v =
    hue >= 32 && hue <= 204
      ? 0.75
      : hue >= 216 && hue <= 273
        ? 0.96
        : 0.9;

  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;

  let r, g, b;
  if (h < 1) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 2) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 3) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 4) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 5) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  // Convert RGB to integers
  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);

  return { r: red, g: green, b: blue };
}

// Lazy import nip19 to avoid issues if not available
/** @type {Record<string, unknown> | null} */
let nip19Module = null;
async function getNip19() {
  if (!nip19Module) {
    try {
      nip19Module = await import("nostr-tools/nip19");
    } catch (e) {
      console.warn("nostr-tools not available for npub decoding");
      return null;
    }
  }
  return nip19Module;
}

/**
 * Decode Nostr npub to hex pubkey
 * @param {string} npub - Nostr npub string
 * @returns {Promise<string>} Hex pubkey string
 */
async function decodeNpubAsync(npub) {
  try {
    const nip19 = await getNip19();
    if (!nip19 || typeof nip19.decode !== "function") return "";
    const decoded = /** @type {{ decode: (s: string) => { type: string; data?: string } }} */ (nip19).decode(npub);
    if (decoded.type === "npub" && decoded.data) {
      return decoded.data;
    }
    return "";
  } catch (e) {
    console.error("Error decoding npub:", e);
    return "";
  }
}

/**
 * Decode Nostr npub to hex pubkey (synchronous fallback)
 * @param {string} npub - Nostr npub string
 * @returns {string} Hex pubkey string
 */
function decodeNpub(npub) {
  // Try synchronous decode if nip19 is already loaded
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nip19 = require("nostr-tools/nip19");
    const decoded = nip19.decode(npub);
    if (decoded.type === "npub") {
      return decoded.data;
    }
    return "";
  } catch (e) {
    // If require fails, return empty string (will use fallback color)
    return "";
  }
}

/**
 * Convert Nostr npub to hex color
 * @param {string} npub - Nostr npub string
 * @returns {string} Hex color string (e.g., "#FF0000")
 */
export function npubToHexColor(npub) {
  try {
    const decodedPubkey = decodeNpub(npub);
    // Ensure we have a valid hex string
    if (!decodedPubkey || !/^[0-9a-fA-F]+$/.test(decodedPubkey)) {
      // Fallback to a default color if decoding fails
      return "#808080"; // Gray color
    }
    const color = hexToColor(decodedPubkey);
    return rgbToHex(color.r, color.g, color.b);
  } catch (e) {
    // Fallback to a default color if any error occurs
    return "#808080"; // Gray color
  }
}

/**
 * Convert Nostr npub to hex color (async version)
 * @param {string} npub - Nostr npub string
 * @returns {Promise<string>} Hex color string (e.g., "#FF0000")
 */
export async function npubToHexColorAsync(npub) {
  try {
    const decodedPubkey = await decodeNpubAsync(npub);
    // Ensure we have a valid hex string
    if (!decodedPubkey || !/^[0-9a-fA-F]+$/.test(decodedPubkey)) {
      // Fallback to a default color if decoding fails
      return "#808080"; // Gray color
    }
    const color = hexToColor(decodedPubkey);
    return rgbToHex(color.r, color.g, color.b);
  } catch (e) {
    // Fallback to a default color if any error occurs
    return "#808080"; // Gray color
  }
}

/**
 * Convert Nostr npub to color integer (with alpha)
 * @param {string} npub - Nostr npub string
 * @returns {number} Color integer (0xFFRRGGBB format)
 */
export function npubToColor(npub) {
  try {
    const decodedPubkey = decodeNpub(npub);
    // Ensure we have a valid hex string
    if (!decodedPubkey || !/^[0-9a-fA-F]+$/.test(decodedPubkey)) {
      // Fallback to a default color if decoding fails
      return 0xff808080; // Gray color
    }
    const color = hexToColor(decodedPubkey);
    return (0xff << 24) | (color.r << 16) | (color.g << 8) | color.b;
  } catch (e) {
    // Fallback to a default color if any error occurs
    return 0xff808080; // Gray color
  }
}

/**
 * Convert Nostr npub to color integer (async version)
 * @param {string} npub - Nostr npub string
 * @returns {Promise<number>} Color integer (0xFFRRGGBB format)
 */
export async function npubToColorAsync(npub) {
  try {
    const decodedPubkey = await decodeNpubAsync(npub);
    // Ensure we have a valid hex string
    if (!decodedPubkey || !/^[0-9a-fA-F]+$/.test(decodedPubkey)) {
      // Fallback to a default color if decoding fails
      return 0xff808080; // Gray color
    }
    const color = hexToColor(decodedPubkey);
    return (0xff << 24) | (color.r << 16) | (color.g << 8) | color.b;
  } catch (e) {
    // Fallback to a default color if any error occurs
    return 0xff808080; // Gray color
  }
}

/**
 * Convert RGB to hex string
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {string} Hex color string (e.g., "#FF0000")
 */
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

// Backwards compatibility wrappers (extensions-specific naming)
export const extensionToColor = stringToColor;
export const extensionToHexColor = stringToHexColor;
export const extensionToColorInt = stringToColorInt;

/**
 * Get file extension color from filename
 * @param {string} filename - Filename with extension
 * @returns {string} Hex color string
 */
export function getFileExtensionColor(filename) {
  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  const extension = typeof ext === "string" ? ext : "";
  return stringToHexColor(extension);
}

/**
 * Get file extension color integer from filename
 * @param {string} filename - Filename with extension
 * @returns {number} Color integer (0xFFRRGGBB format)
 */
export function getFileExtensionColorInt(filename) {
  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  const extension = typeof ext === "string" ? ext : "";
  return stringToColorInt(extension);
}

// ============================================
// Profile Text Color Utilities
// ============================================

/**
 * Adjust brightness of an RGB color
 * @param {{r: number, g: number, b: number}} rgb - RGB color object
 * @param {number} factor - Brightness factor (>1 brightens, <1 darkens)
 * @returns {{r: number, g: number, b: number}} Adjusted RGB color
 */
export function adjustColorBrightness(rgb, factor) {
  return {
    r: Math.min(255, Math.max(0, Math.round(rgb.r * factor))),
    g: Math.min(255, Math.max(0, Math.round(rgb.g * factor))),
    b: Math.min(255, Math.max(0, Math.round(rgb.b * factor))),
  };
}

/**
 * Get profile color adjusted for text readability
 * Brightens by 8% in dark mode, darkens by 5% in light mode for better contrast
 * 
 * USAGE: Use this for ALL profile-colored text (author names, mentions, etc.)
 * 
 * @param {{r: number, g: number, b: number}} rgb - Base profile color from hexToColor() or stringToColor()
 * @param {boolean} isDarkMode - Whether dark mode is active
 * @returns {{r: number, g: number, b: number}} Adjusted RGB color for text use
 * 
 * @example
 * const baseColor = hexToColor(pubkey);
 * const textColor = getProfileTextColor(baseColor, isDarkMode);
 * const style = `color: ${rgbToCssString(textColor)}`;
 */
export function getProfileTextColor(rgb, isDarkMode) {
  const factor = isDarkMode ? 1.08 : 0.95;
  return adjustColorBrightness(rgb, factor);
}

/**
 * Convert RGB color object to CSS rgb() string
 * @param {{r: number, g: number, b: number}} rgb - RGB color object
 * @returns {string} CSS rgb() color string (e.g., "rgb(255, 128, 64)")
 */
export function rgbToCssString(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}
