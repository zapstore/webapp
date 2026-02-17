<script lang="js">
/**
 * ProfilePicStack - Overlapping profile pics with optional text pill
 *
 * Shows stacked profile pictures with:
 * - Black66 shadow on right side of each pic
 * - Slight overlap between pics
 * - First pic on top (highest z-index)
 * - Optional text pill on the right with white8 background
 */
import ProfilePic from "./ProfilePic.svelte";
let { profiles = [], text = "", suffix = "", size = "sm", className = "", maxDisplay = 3, onclick, } = $props();
// Size mappings for overlap and pill height
const sizeMap = {
    xs: { overlap: 6, height: 20 },
    sm: { overlap: 8, height: 28 },
    md: { overlap: 10, height: 38 },
    lg: { overlap: 12, height: 48 },
};
const displayedProfiles = $derived(profiles.slice(0, maxDisplay));
const overlapPx = $derived(sizeMap[size]?.overlap || 8);
const pillHeight = $derived(sizeMap[size]?.height || 28);
function handleClick() {
    onclick?.();
}
</script>

<button
  type="button"
  class="profile-pic-stack {className}"
  onclick={handleClick}
>
  {#if displayedProfiles.length > 0}
    <div class="stacked-pics" style="--overlap: -{overlapPx}px;">
      {#each displayedProfiles as profile, i}
        <div
          class="stacked-pic"
          style="z-index: {displayedProfiles.length - i};"
        >
          <ProfilePic
            pictureUrl={profile.pictureUrl}
            name={profile.name}
            pubkey={profile.pubkey}
            {size}
          />
        </div>
      {/each}
    </div>
  {/if}

  {#if text || suffix}
    <div class="text-pill" style="height: {pillHeight}px;">
      {#if text}
        <span class="text-content">{text}</span>
      {/if}
      {#if suffix}
        <span class="text-suffix">{suffix}</span>
      {/if}
    </div>
  {/if}
</button>

<style>
  .profile-pic-stack {
    display: flex;
    align-items: center;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
  }

  .stacked-pics {
    display: flex;
    flex-direction: row;
  }

  .stacked-pic {
    margin-left: var(--overlap);
    position: relative;
  }

  .stacked-pic:first-child {
    margin-left: 0;
  }

  /* Shadow on the right side of each pic using box-shadow */
  .stacked-pic:not(:last-child) :global(.profile-pic) {
    box-shadow: 4px 0 8px -2px hsl(var(--black66));
  }

  .text-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px 0 16px;
    margin-left: var(--overlap, -8px);
    background-color: hsl(var(--white8));
    border-radius: 9999px;
    min-width: 0;
  }

  .text-content {
    font-size: 0.8125rem;
    font-weight: 500;
    color: hsl(var(--white66));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .text-suffix {
    font-size: 0.8125rem;
    font-weight: 600;
    color: hsl(var(--white33));
    flex-shrink: 0;
  }
</style>
