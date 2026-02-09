<script lang="ts">
  /**
   * ZapSlider - Arc slider for zap amount + ShortTextInput for comment
   */
  import { onMount } from "svelte";
  import Zap from "$lib/components/icons/Zap.svelte";
  import ProfilePic from "$lib/components/common/ProfilePic.svelte";
  import ShortTextInput from "$lib/components/common/ShortTextInput.svelte";

  type ProfileHit = { pubkey: string; name?: string; displayName?: string; picture?: string };
  type EmojiHit = { shortcode: string; url: string; source: string };

  interface ZapProfile {
    pictureUrl?: string;
    name?: string;
    pubkey?: string;
  }

  interface OtherZap {
    amount: number;
    profile?: ZapProfile;
  }

  interface Props {
    profile?: ZapProfile | null;
    initialValue?: number;
    otherZaps?: OtherZap[];
    message?: string;
    searchProfiles?: (query: string) => Promise<ProfileHit[]>;
    searchEmojis?: (query: string) => Promise<EmojiHit[]>;
    placeholder?: string;
    onvalueChanged?: (event: { value: number }) => void;
    onsendZap?: (event: {
      amount: number;
      message: string;
      emojiTags: { shortcode: string; url: string }[];
      mentions: string[];
    }) => void;
  }

  let {
    profile = null,
    initialValue = 100,
    otherZaps = [],
    message = $bindable(""),
    searchProfiles = async () => [],
    searchEmojis = async () => [],
    placeholder = "Add a comment...",
    onvalueChanged,
    onsendZap,
  }: Props = $props();

  let shortTextInput = $state<{ clear: () => void; focus: () => void; getSerializedContent: () => { text: string; emojiTags: { shortcode: string; url: string }[]; mentions: string[] } } | null>(null);
  let amountInputElement = $state<HTMLInputElement | null>(null);

  const START_ANGLE = (Math.PI * 3) / 4;
  const TOTAL_ANGLE = (Math.PI * 3) / 2;
  const MIN_VALUE = 0;
  const MAX_VALUE = 1000001;
  const SIZE = 320;
  const RADIUS = 100;
  const BACKGROUND_THICKNESS = 48;
  const VALUE_THICKNESS = 32;
  const HANDLE_SIZE = 24;
  const MARKER_LENGTH = 8;
  const markerValues = [0, 10, 100, 1000, 10000, 100000, 1000000];

  let value = $state(0);
  let canvasElement = $state<HTMLCanvasElement | null>(null);
  let isDragging = $state(false);
  let isEditingAmount = $state(false);
  let amountInputValue = $state("");

  const isTopZap = $derived(
    otherZaps.length > 0 && value > Math.max(...otherZaps.map((z) => z.amount), 0)
  );

  $effect(() => {
    const v = Math.max(MIN_VALUE, Math.min(MAX_VALUE, initialValue));
    if (!isEditingAmount) value = v;
  });

  $effect(() => {
    if (!isEditingAmount) {
      amountInputValue = formatWithCommas(Math.round(value));
    }
  });

  function formatWithCommas(val: number): string {
    return Math.round(val).toLocaleString("en-US");
  }

  function formatMarkerLabel(val: number): string {
    if (val >= 1000000) return `${Math.round(val / 1000000)}M`;
    if (val >= 1000) return `${Math.round(val / 1000)}K`;
    return val.toString();
  }

  function valueToAngle(val: number): number {
    if (val <= 0) return START_ANGLE;
    const percentage = Math.log(val + 1) / Math.log(MAX_VALUE + 1);
    return START_ANGLE + percentage * TOTAL_ANGLE;
  }

  function angleToValue(angle: number): number {
    let adjustedAngle = angle - START_ANGLE;
    if (adjustedAngle < 0) adjustedAngle += 2 * Math.PI;
    adjustedAngle = Math.max(0, Math.min(TOTAL_ANGLE, adjustedAngle));
    const percentage = adjustedAngle / TOTAL_ANGLE;
    const logValue = percentage * Math.log(MAX_VALUE + 1);
    return Math.exp(logValue) - 1;
  }

  function getPositionOnArc(angle: number, radius: number): { x: number; y: number } {
    return {
      x: SIZE / 2 + radius * Math.cos(angle),
      y: SIZE / 2 + radius * Math.sin(angle),
    };
  }

  function handleInteraction(clientX: number, clientY: number) {
    if (!canvasElement) return;
    const rect = canvasElement.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const centerX = SIZE / 2;
    const centerY = SIZE / 2;
    let angle = Math.atan2(scaledY - centerY, scaledX - centerX);
    if (angle > Math.PI / 2.75 && angle < (Math.PI * 3) / 4) {
      angle = START_ANGLE;
    }
    const newValue = angleToValue(angle);
    value = Math.round(Math.max(MIN_VALUE, Math.min(MAX_VALUE, newValue)));
    onvalueChanged?.({ value });
    drawSlider();
  }

  function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    handleInteraction(e.clientX, e.clientY);
  }

  function handleTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (t) {
      isDragging = true;
      handleInteraction(t.clientX, t.clientY);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    e.preventDefault();
    handleInteraction(e.clientX, e.clientY);
  }

  function handlePointerUp() {
    isDragging = false;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isDragging) return;
    const t = e.touches[0];
    if (t) {
      e.preventDefault();
      handleInteraction(t.clientX, t.clientY);
    }
  }

  function handleTouchEnd() {
    isDragging = false;
  }

  function drawSlider() {
    if (!canvasElement) return;
    const ctx = canvasElement.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvasElement.width = SIZE * dpr;
    canvasElement.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const centerX = SIZE / 2;
    const centerY = SIZE / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);

    otherZaps.forEach((zapData) => {
      const percentage =
        zapData.amount <= 0 ? 0 : Math.log(zapData.amount + 1) / Math.log(MAX_VALUE + 1);
      const angle = START_ANGLE + percentage * TOTAL_ANGLE;
      const innerRadius = RADIUS - BACKGROUND_THICKNESS / 2;
      const outerRadius = RADIUS + BACKGROUND_THICKNESS / 2 + MARKER_LENGTH + 6 + 9 - 10;
      const gradient = ctx.createLinearGradient(
        centerX + innerRadius * Math.cos(angle),
        centerY + innerRadius * Math.sin(angle),
        centerX + outerRadius * Math.cos(angle),
        centerY + outerRadius * Math.sin(angle)
      );
      gradient.addColorStop(0, "#FFC736");
      gradient.addColorStop(1, "#FFA037");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 0.33;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(
        centerX + innerRadius * Math.cos(angle),
        centerY + innerRadius * Math.sin(angle)
      );
      ctx.lineTo(
        centerX + outerRadius * Math.cos(angle),
        centerY + outerRadius * Math.sin(angle)
      );
      ctx.stroke();
    });

    ctx.strokeStyle = "rgba(0, 0, 0, 0.33)";
    ctx.lineWidth = BACKGROUND_THICKNESS;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(centerX, centerY, RADIUS, START_ANGLE, START_ANGLE + TOTAL_ANGLE);
    ctx.stroke();

    markerValues.forEach((markerValue) => {
      const percentage =
        markerValue <= 0 ? 0 : Math.log(markerValue + 1) / Math.log(MAX_VALUE + 1);
      const angle = START_ANGLE + percentage * TOTAL_ANGLE;
      const innerRadius = RADIUS - BACKGROUND_THICKNESS / 2;
      const outerRadius = RADIUS + BACKGROUND_THICKNESS / 2 + MARKER_LENGTH;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.33)";
      ctx.lineWidth = 0.33;
      ctx.beginPath();
      ctx.moveTo(
        centerX + innerRadius * Math.cos(angle),
        centerY + innerRadius * Math.sin(angle)
      );
      ctx.lineTo(
        centerX + outerRadius * Math.cos(angle),
        centerY + outerRadius * Math.sin(angle)
      );
      ctx.stroke();
      const labelRadius = outerRadius + 14;
      const labelX = centerX + labelRadius * Math.cos(angle);
      const labelY = centerY + labelRadius * Math.sin(angle);
      ctx.fillStyle = "rgba(255, 255, 255, 0.33)";
      ctx.font = "500 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatMarkerLabel(markerValue), labelX, labelY);
    });

    const percentage = value <= 0 ? 0 : Math.log(value + 1) / Math.log(MAX_VALUE + 1);
    const sweepAngle = percentage * TOTAL_ANGLE;
    if (sweepAngle > 0) {
      const gradient = ctx.createConicGradient(
        START_ANGLE - Math.PI / 2,
        centerX,
        centerY
      );
      gradient.addColorStop(0, "#FFC736");
      gradient.addColorStop(0.5, "#FFA037");
      gradient.addColorStop(1, "#FFC736");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = VALUE_THICKNESS;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(centerX, centerY, RADIUS, START_ANGLE, START_ANGLE + sweepAngle);
      ctx.stroke();
    }
    const handleAngle = START_ANGLE + sweepAngle;
    const handleX = centerX + RADIUS * Math.cos(handleAngle);
    const handleY = centerY + RADIUS * Math.sin(handleAngle);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(handleX, handleY, HANDLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  $effect(() => {
    if (canvasElement && (value !== undefined || otherZaps)) {
      drawSlider();
    }
  });

  onMount(() => {
    drawSlider();
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  });

  async function handleAmountRowClick() {
    const { tick } = await import("svelte");
    isEditingAmount = true;
    amountInputValue = Math.round(value).toString();
    await tick();
    amountInputElement?.focus();
    amountInputElement?.select();
  }

  function handleAmountInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const cleaned = target.value.replace(/[^0-9]/g, "");
    const numValue = parseInt(cleaned, 10);
    if (cleaned === "" || isNaN(numValue)) {
      amountInputValue = "";
      value = 0;
    } else {
      value = Math.max(MIN_VALUE, Math.min(MAX_VALUE, numValue));
      amountInputValue = formatWithCommas(value);
    }
    onvalueChanged?.({ value });
    drawSlider();
  }

  function handleAmountBlur() {
    isEditingAmount = false;
    if (amountInputValue === "" || value === 0) {
      value = 0;
    }
    amountInputValue = formatWithCommas(Math.round(value));
  }

  function handleAmountKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  }

  function handleCommentSubmit(event: {
    text: string;
    emojiTags: { shortcode: string; url: string }[];
    mentions: string[];
  }) {
    message = event.text;
    onsendZap?.({
      amount: Math.round(value),
      message: event.text,
      emojiTags: event.emojiTags,
      mentions: event.mentions,
    });
  }

  function handleCommentClose() {
    shortTextInput?.clear?.();
    message = "";
  }

  export function getValue(): number {
    return Math.round(value);
  }
  export function getMessage(): string {
    return message;
  }
  /** Same shape as ShortTextInput.getSerializedContent (for comments/zaps: text + emojiTags + mentions). */
  export function getSerializedContent(): {
    text: string;
    emojiTags: { shortcode: string; url: string }[];
    mentions: string[];
  } {
    return shortTextInput?.getSerializedContent?.() ?? {
      text: message,
      emojiTags: [],
      mentions: [],
    };
  }
</script>

<div class="zap-slider">
  <div class="slider-container">
    <div class="slider-canvas-wrapper">
      <canvas
        bind:this={canvasElement}
        class="slider-canvas"
        style="width: {SIZE}px; height: {SIZE}px;"
        onpointerdown={handlePointerDown}
        ontouchstart={handleTouchStart}
      ></canvas>

      {#each otherZaps as zapData}
        {@const percentage =
          zapData.amount <= 0
            ? 0
            : Math.log(zapData.amount + 1) / Math.log(MAX_VALUE + 1)}
        {@const angle = START_ANGLE + percentage * TOTAL_ANGLE}
        {@const outerRadius = RADIUS + BACKGROUND_THICKNESS / 2 + MARKER_LENGTH + 6}
        {@const pos = getPositionOnArc(angle, outerRadius + 9)}
        <div
          class="zap-profile-marker"
          style="left: {pos.x - 9}px; top: {pos.y - 9}px;"
        >
          <ProfilePic
            pictureUrl={zapData.profile?.pictureUrl}
            name={zapData.profile?.name}
            pubkey={zapData.profile?.pubkey}
            size="xs"
          />
        </div>
      {/each}

      <div class="center-profile">
        <ProfilePic
          pictureUrl={profile?.pictureUrl}
          name={profile?.name}
          pubkey={profile?.pubkey}
          size="2xl"
          className="profile-pic-large"
        />
      </div>
    </div>
  </div>

  <div class="input-container">
    <button type="button" class="amount-row" onclick={handleAmountRowClick}>
      <div class="row-left">
        <Zap variant="fill" size={16} color="url(#gold-gradient)" />
        <input
          bind:this={amountInputElement}
          type="text"
          inputmode="numeric"
          class="amount-input"
          bind:value={amountInputValue}
          oninput={handleAmountInput}
          onblur={handleAmountBlur}
          onkeydown={handleAmountKeydown}
          onclick={(e) => e.stopPropagation()}
        />
      </div>
      {#if isTopZap}
        <div class="top-zap-badge">
          <span>Top Zap</span>
        </div>
      {/if}
    </button>

    <div class="divider"></div>

    <ShortTextInput
      bind:this={shortTextInput}
      {placeholder}
      {searchProfiles}
      {searchEmojis}
      size="small"
      showActionRow={true}
      showCloseWhen="focusedOrContent"
      onCameraTap={() => {}}
      onEmojiTap={() => {}}
      onGifTap={() => {}}
      onAddTap={() => {}}
      onChevronTap={() => {}}
      allowEmptySubmit={true}
      onsubmit={handleCommentSubmit}
      onchange={({ content }) => (message = content)}
      onClose={handleCommentClose}
    />
  </div>

  <svg width="0" height="0" style="position: absolute;">
    <defs>
      <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#FFC736" />
        <stop offset="100%" style="stop-color:#FFA037" />
      </linearGradient>
    </defs>
  </svg>
</div>

<style>
  .zap-slider {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
  }
  .slider-container {
    height: 296px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  .slider-canvas-wrapper {
    position: relative;
    width: 320px;
    height: 320px;
    overflow: visible;
  }
  .slider-canvas {
    cursor: pointer;
    touch-action: none;
  }
  .center-profile {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .center-profile :global(.profile-pic-large) {
    width: 104px !important;
    height: 104px !important;
    min-width: 104px !important;
    min-height: 104px !important;
  }
  .zap-profile-marker {
    position: absolute;
    pointer-events: none;
  }
  .input-container {
    background: hsl(var(--black33));
    border-radius: var(--radius-16);
    border: 0.33px solid hsl(var(--white33));
    width: 100%;
  }
  .amount-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: text;
  }
  .row-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }
  .amount-input {
    font-size: 18px;
    font-weight: 700;
    color: hsl(var(--white));
    font-family: var(--font-sans);
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
    flex: 1;
    min-width: 0;
    cursor: text;
  }
  .amount-input::placeholder {
    color: hsl(var(--white33));
  }
  .top-zap-badge {
    display: flex;
    align-items: center;
    height: 22px;
    background: linear-gradient(
      135deg,
      rgba(255, 199, 54, 0.16) 0%,
      rgba(255, 160, 55, 0.16) 100%
    );
    border-radius: 11px;
    padding: 0 10px;
    flex-shrink: 0;
  }
  .top-zap-badge span {
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    background: linear-gradient(135deg, #ffc736 0%, #ffa037 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .divider {
    height: 1.4px;
    background: hsl(var(--white8));
    margin: 0;
  }
</style>
