<script lang="ts">
  /**
   * SpinKeyModal - Slot machine style nsec key generator
   *
   * Features:
   * - 12 spinning slots showing nsec characters (3 rows of 4)
   * - Draggable handle to trigger spin
   * - Staggered animation with custom easing
   * - Auto-proceeds after spin completes
   *
   * @see zaplab_design/lib/src/widgets/keys/slot_machine.dart
   */
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Modal from "$lib/components/common/Modal.svelte";
  import { Download } from "$lib/components/icons";
  import * as nip19 from "nostr-tools/nip19";
  import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

  function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  interface Props {
    open?: boolean;
    profileName?: string;
    /** Delay in ms after spin completes before proceeding */
    spinCompleteDelay?: number;
    /** z-index for the modal (use 55+ when opening on top of GetStarted to avoid glitch) */
    zIndex?: number;
    onspinComplete?: (event: { nsec: string; secretKeyHex: string; pubkey: string; profileName: string }) => void;
    onuseExistingKey?: () => void;
  }

  let {
    open = $bindable(false),
    profileName = "",
    spinCompleteDelay = 1200,
    zIndex = 55,
    onspinComplete,
    onuseExistingKey,
  }: Props = $props();

  // Bech32 characters used in nsec encoding (32 chars)
  const BECH32_CHARS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

  // Layout constants
  const TOTAL_HEIGHT = 296;
  const DISK_HEIGHT = 88;
  const SLOT_TOP = (TOTAL_HEIGHT - DISK_HEIGHT) / 2; // 104 - centered vertically
  const CENTER_Y = SLOT_TOP + DISK_HEIGHT / 2; // 148 - center of slot
  const HANDLE_MIN_OFFSET = 40;
  const HANDLE_MAX_OFFSET = 256;

  let nsec = $state("");
  let secretKeyHex = $state("");
  let pubkey = $state("");
  let slotParts = $state<string[]>(Array(12).fill("").map((_, i) => (i < 9 ? "-----" : "------")));
  let currentDisplayParts = $state<string[]>(Array(12).fill("").map((_, i) => (i < 9 ? "-----" : "------")));
  let isSpinning = $state(false);
  let hasSpun = $state(false);

  let handleOffset = $state(HANDLE_MIN_OFFSET);
  let isDragging = $state(false);
  let handleContainerEl = $state<HTMLElement | null>(null);

  // Mutable array for cleanup only (no reactivity needed)
  const slotIntervals: ReturnType<typeof setInterval>[] = [];

  const isBottomHalf = $derived(handleOffset > CENTER_Y);
  const barHeight = $derived(Math.abs(handleOffset - CENTER_Y));
  const barTop = $derived(isBottomHalf ? CENTER_Y : handleOffset);

  const distanceFromCenter = $derived(Math.abs(handleOffset - CENTER_Y));
  const maxDistanceFromCenter = $derived(CENTER_Y - HANDLE_MIN_OFFSET);
  const circleProgress = $derived(1.0 - distanceFromCenter / maxDistanceFromCenter);
  const circleSize = $derived(44 + 6 * Math.max(0, circleProgress));

  function generateNewKey() {
    const secretKey = generateSecretKey();
    secretKeyHex = bytesToHex(secretKey);
    pubkey = getPublicKey(secretKey);
    nsec = nip19.nsecEncode(secretKey);
    slotParts = splitNsecIntoParts(nsec);
  }

  function splitNsecIntoParts(nsecStr: string): string[] {
    const parts: string[] = [];
    let pos = 0;
    for (let i = 0; i < 12; i++) {
      const chunkSize = i < 9 ? 5 : 6;
      parts.push(nsecStr.substring(pos, pos + chunkSize).toUpperCase());
      pos += chunkSize;
    }
    return parts;
  }

  function getRandomBech32String(length: number): string {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += BECH32_CHARS[Math.floor(Math.random() * BECH32_CHARS.length)];
    }
    return result.toUpperCase();
  }

  function settleSlot(index: number, targetValue: string, charLength: number) {
    let count = 0;
    const settleInterval = setInterval(() => {
      count++;
      if (count >= 4) {
        clearInterval(settleInterval);
        currentDisplayParts = currentDisplayParts.map((p, i) => (i === index ? targetValue : p));
      } else {
        currentDisplayParts = currentDisplayParts.map((p, i) => (i === index ? getRandomBech32String(charLength) : p));
      }
    }, 60);
  }

  function spin() {
    if (isSpinning) return;

    isSpinning = true;
    generateNewKey();

    slotIntervals.forEach((id) => clearInterval(id));
    slotIntervals.length = 0;

    slotParts.forEach((targetValue, index) => {
      const startDelay = index * 100;
      const spinDuration = 2000;
      const charLength = index < 9 ? 5 : 6;

      setTimeout(() => {
        const intervalId = setInterval(() => {
          currentDisplayParts = currentDisplayParts.map((p, i) => (i === index ? getRandomBech32String(charLength) : p));
        }, 50);
        slotIntervals[index] = intervalId;

        setTimeout(() => {
          const id = slotIntervals[index];
          if (id) clearInterval(id);
          settleSlot(index, targetValue, charLength);
        }, spinDuration);
      }, startDelay);
    });

    const totalDuration = 2000 + 11 * 100 + 300;
    setTimeout(() => {
      isSpinning = false;
      hasSpun = true;
      setTimeout(() => {
        onspinComplete?.({ nsec, secretKeyHex, pubkey, profileName });
      }, spinCompleteDelay);
    }, totalDuration);
  }

  function handleDragStart(e: MouseEvent | TouchEvent) {
    if (isSpinning) return;
    isDragging = true;
    e.preventDefault();
    setupGlobalListeners();
  }

  function handleDragMove(e: MouseEvent | TouchEvent) {
    if (!isDragging || isSpinning || !handleContainerEl) return;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;
    const rect = handleContainerEl.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    handleOffset = Math.max(HANDLE_MIN_OFFSET, Math.min(HANDLE_MAX_OFFSET, relativeY));
  }

  function handleDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    cleanupGlobalListeners();
    if (handleOffset > CENTER_Y + 30) spin();
    animateHandleBack();
  }

  function animateHandleBack() {
    const startOffset = handleOffset;
    const startTime = performance.now();
    const duration = 200;
    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      handleOffset = startOffset + (HANDLE_MIN_OFFSET - startOffset) * eased;
      if (t < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  function setupGlobalListeners() {
    if (browser) {
      window.addEventListener("mousemove", handleDragMove as (e: MouseEvent) => void);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleDragMove as (e: TouchEvent) => void, { passive: false });
      window.addEventListener("touchend", handleDragEnd);
    }
  }

  function cleanupGlobalListeners() {
    if (browser) {
      window.removeEventListener("mousemove", handleDragMove as (e: MouseEvent) => void);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove as (e: TouchEvent) => void);
      window.removeEventListener("touchend", handleDragEnd);
    }
  }

  function handleExistingKey() {
    onuseExistingKey?.();
  }

  onMount(() => {
    generateNewKey();
  });

  onDestroy(() => {
    slotIntervals.forEach((id) => clearInterval(id));
    cleanupGlobalListeners();
  });

  $effect(() => {
    if (!open && hasSpun) {
      const t = setTimeout(() => {
        hasSpun = false;
        isSpinning = false;
        handleOffset = HANDLE_MIN_OFFSET;
        currentDisplayParts = Array(12).fill("").map((_, i) => (i < 9 ? "-----" : "------"));
      }, 300);
      return () => clearTimeout(t);
    }
  });
</script>

<Modal bind:open ariaLabel="Generate your Nostr key" zIndex={zIndex}>
  <div class="modal-wrapper">
    <div class="modal-content">
      <h1 class="title" class:title-long={profileName.length > 12}>Hey {profileName}!</h1>
      <p class="description">
        Spin up a <button type="button" class="link-text" onclick={handleExistingKey}>secret key</button> to secure your profile and publications
      </p>

      <div class="slot-machine">
        <div class="slots-container">
          {#each [0, 1, 2] as rowIndex}
            <div class="slot-row">
              {#each [0, 1, 2, 3] as colIndex}
                {@const slotIndex = rowIndex * 4 + colIndex}
                <div class="slot">
                  <div class="slot-content">
                    {#if currentDisplayParts[slotIndex]?.startsWith("---")}
                      <div class="slot-placeholder"></div>
                    {:else}
                      <span class="slot-text">{currentDisplayParts[slotIndex]}</span>
                    {/if}
                  </div>
                </div>
              {/each}
              <div class="row-gradient-top"></div>
              <div class="row-gradient-bottom"></div>
            </div>
          {/each}
        </div>

        <div class="handle-container" bind:this={handleContainerEl}>
          <div class="handle-slot"></div>
          {#if barHeight > 2}
            <div
              class="handle-bar"
              class:bar-top={!isBottomHalf}
              class:bar-bottom={isBottomHalf}
              style="height: {barHeight}px; top: {barTop}px;"
            ></div>
          {/if}
          <div
            class="handle-ball"
            class:dragging={isDragging}
            style="top: {handleOffset - circleSize / 2}px; width: {circleSize}px; height: {circleSize}px; left: {2 - (circleSize - 44) / 2}px;"
            onmousedown={handleDragStart}
            ontouchstart={handleDragStart}
            role="button"
            tabindex="0"
            aria-label="Drag down to spin"
          >
            <div class="handle-ball-shine"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="app-section">
      <p class="app-description">For the most secure key generation, use the native app</p>
      <button
        type="button"
        class="btn-secondary-large btn-secondary-light w-full flex items-center justify-center gap-3"
        style="color: hsl(var(--white66));"
        onclick={() => window.open("https://zapstore.dev", "_blank")}
      >
        <Download variant="fill" color="hsl(var(--white33))" size={20} />
        Download Zapstore
      </button>
    </div>
  </div>
</Modal>

<style>
  .modal-wrapper {
    display: flex;
    flex-direction: column;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
  }

  @media (min-width: 768px) {
    .modal-content {
      padding: 24px;
    }
  }

  .divider {
    height: 1.4px;
    background-color: hsl(var(--white11));
    width: 100%;
  }

  .app-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 16px 16px;
  }

  @media (min-width: 768px) {
    .app-section {
      padding: 16px 24px 20px;
    }
  }

  .app-description {
    font-size: 1rem;
    color: hsl(var(--white33));
    text-align: center;
    margin: 0 0 12px;
  }

  .title {
    font-size: 2.25rem;
    font-weight: 650;
    color: hsl(var(--white));
    margin: 0 0 8px;
    text-align: center;
  }

  .title.title-long {
    font-size: 1.5rem;
  }

  @media (min-width: 768px) {
    .title.title-long {
      font-size: 1.75rem;
    }
  }

  .description {
    font-size: 1rem;
    color: hsl(var(--white66));
    margin: 0 0 24px;
    text-align: center;
    line-height: 1.5;
    max-width: 344px;
  }

  .link-text {
    color: hsl(var(--white66));
    text-decoration: underline;
    text-decoration-color: hsl(var(--white33));
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }

  .link-text:hover {
    color: hsl(var(--white));
    text-decoration-color: hsl(var(--white66));
  }

  .slot-machine {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
  }

  .slots-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .slot-row {
    display: flex;
    gap: 4px;
    padding: 0 8px;
    height: 88px;
    background-color: hsl(var(--black66));
    border-radius: 16px;
    border: 0.33px solid hsl(var(--white16));
    position: relative;
    overflow: hidden;
    align-items: center;
  }

  .slot {
    width: 64px;
    height: 88px;
    background-color: hsl(var(--white16));
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .slot-content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 56px;
    border-bottom: 0.33px solid hsl(var(--black33));
  }

  .slot-placeholder {
    width: 24px;
    height: 8px;
    background-color: hsl(var(--white33));
    border-radius: 2px;
  }

  .slot-text {
    font-family: "Geist Mono", monospace;
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--white));
    letter-spacing: -0.3px;
    text-transform: uppercase;
  }

  .row-gradient-top,
  .row-gradient-bottom {
    position: absolute;
    left: 0;
    right: 0;
    height: 32px;
    pointer-events: none;
    z-index: 1;
  }

  .row-gradient-top {
    top: 0;
    background: linear-gradient(to bottom, rgba(20, 20, 24, 1) 0%, rgba(20, 20, 24, 0.7) 40%, rgba(20, 20, 24, 0) 100%);
  }

  .row-gradient-bottom {
    bottom: 0;
    background: linear-gradient(to top, rgba(24, 24, 28, 1) 0%, rgba(24, 24, 28, 0.7) 40%, rgba(24, 24, 28, 0) 100%);
  }

  .handle-container {
    width: 48px;
    height: 296px;
    position: relative;
  }

  .handle-slot {
    position: absolute;
    left: 8px;
    top: 104px;
    width: 32px;
    height: 88px;
    background-color: rgba(0, 0, 0, 0.53);
    border-radius: 16px;
    border: 0.33px solid hsl(var(--white16));
  }

  .handle-bar {
    position: absolute;
    left: 16px;
    width: 16px;
    background: linear-gradient(to right, #9696a3, #6a6a75);
    border-radius: 8px;
  }

  .handle-bar.bar-top {
    mask-image: linear-gradient(to bottom, white 50%, rgba(255, 255, 255, 0.4) 75%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, white 50%, rgba(255, 255, 255, 0.4) 75%, transparent 100%);
  }

  .handle-bar.bar-bottom {
    mask-image: linear-gradient(to top, white 50%, rgba(255, 255, 255, 0.4) 75%, transparent 100%);
    -webkit-mask-image: linear-gradient(to top, white 50%, rgba(255, 255, 255, 0.4) 75%, transparent 100%);
  }

  .handle-ball {
    position: absolute;
    border-radius: 50%;
    background: var(--gradient-blurple);
    cursor: grab;
    box-shadow: 0 4px 8px hsl(var(--black33));
    touch-action: none;
    user-select: none;
    transition: transform 0.1s ease;
  }

  .handle-ball:hover {
    transform: scale(1.05);
  }

  .handle-ball.dragging {
    cursor: grabbing;
    transform: scale(1.1);
  }

  .handle-ball-shine {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, transparent 0%, hsl(var(--black33)) 100%);
  }
</style>
