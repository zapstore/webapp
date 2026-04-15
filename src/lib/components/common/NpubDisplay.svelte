<script lang="js">
/**
 * NpubDisplay - Displays an npub with a colored profile circle
 */
import { hexToColor } from '$lib/utils/color.js';
let { npub = '', pubkey = '', size = 'md', truncate = true, className = '' } = $props();
const dotSizes = {
    sm: 6,
    md: 8,
    lg: 10
};
const fontSizes = {
    sm: '0.75rem',
    md: '0.875rem',
    lg: '1rem'
};
const profileColor = $derived(pubkey ? hexToColor(pubkey) : { r: 128, g: 128, b: 128 });
const profileColorStyle = $derived(`rgb(${profileColor.r}, ${profileColor.g}, ${profileColor.b})`);
function formatNpub(npubStr, shouldTruncate) {
    if (!npubStr)
        return '';
    if (!shouldTruncate)
        return npubStr;
    if (npubStr.length < 14)
        return npubStr;
    const afterPrefix = npubStr.startsWith('npub1') ? npubStr.slice(5, 8) : npubStr.slice(0, 3);
    return `npub1${afterPrefix}......${npubStr.slice(-6)}`;
}
const displayNpub = $derived(formatNpub(npub, truncate));
const dotSize = $derived(dotSizes[size] || dotSizes.md);
const fontSize = $derived(fontSizes[size] || fontSizes.md);
</script>

<span class="npub-display {className}" style="--dot-size: {dotSize}px; --font-size: {fontSize};">
	<span class="profile-dot" style="background-color: {profileColorStyle};"></span>
	<span class="npub-text">{displayNpub}</span>
</span>

<style>
	.npub-display {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.profile-dot {
		width: var(--dot-size);
		height: var(--dot-size);
		border-radius: 50%;
		border: 0.33px solid var(--white16);
		flex-shrink: 0;
	}

	.npub-text {
		font-size: var(--font-size);
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
