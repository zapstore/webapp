<script lang="js">
/**
 * ZapSlider - Arc slider for zap amount + ShortTextInput for comment
 */
import { onMount } from "svelte";
import Zap from "$lib/components/icons/Zap.svelte";
import ProfilePic from "$lib/components/common/ProfilePic.svelte";
import ShortTextInput from "$lib/components/common/ShortTextInput.svelte";
import { hexToColor, getProfileTextColor, rgbToCssString } from "$lib/utils/color.js";
import * as nip19 from "nostr-tools/nip19";
function profileRecipientLabel(/** @type {{ name?: string | null, pubkey?: string | null } | null} */ p) {
    if (!p)
        return "Creator";
    const n = p.name != null && String(p.name).trim() !== "" ? String(p.name).trim() : "";
    if (n)
        return n;
    const pk = p.pubkey;
    if (pk && String(pk).trim().length === 64) {
        try {
            const enc = nip19.npubEncode(pk);
            return `npub1${enc.slice(5, 8)}…${enc.slice(-6)}`;
        }
        catch {
            return pk.slice(0, 8);
        }
    }
    return "Creator";
}
let { profile = null, initialValue = 100, otherZaps = [], message = $bindable(""), searchProfiles = async () => [], searchEmojis = async () => [], placeholder = undefined, amountOnly = false, onvalueChanged, onsendZap, } = $props();
const effectivePlaceholder = $derived(placeholder ?? `Write to ${profileRecipientLabel(profile)}`);
let shortTextInput = $state(null);
let amountInputElement = $state(null);
const START_ANGLE = (Math.PI * 3) / 4;
const TOTAL_ANGLE = (Math.PI * 3) / 2;
const MIN_VALUE = 10;
const MAX_VALUE = 10000000;
const SIZE = 320;
const RADIUS = 100;
const BACKGROUND_THICKNESS = 48;
const VALUE_THICKNESS = 32;
const HANDLE_SIZE = 24;
const MARKER_LENGTH = 8;
const markerValues = [10, 100, 1000, 10000, 100000, 1000000, 10000000];
/** Sats → normalized arc position [0, 1] (log scale from MIN_VALUE to MAX_VALUE). */
function valueToNorm(v) {
    if (v <= MIN_VALUE) return 0;
    if (v >= MAX_VALUE) return 1;
    return (Math.log(v) - Math.log(MIN_VALUE)) / (Math.log(MAX_VALUE) - Math.log(MIN_VALUE));
}
/** Normalized arc position [0, 1] → sats. */
function normToValue(norm) {
    if (norm <= 0) return MIN_VALUE;
    if (norm >= 1) return MAX_VALUE;
    return Math.round(Math.exp(Math.log(MIN_VALUE) + norm * (Math.log(MAX_VALUE) - Math.log(MIN_VALUE))));
}
let value = $state(0);
let canvasElement = $state(null);
let isDragging = $state(false);
let isEditingAmount = $state(false);
let amountInputValue = $state("");
const isTopZap = $derived(otherZaps.length > 0 && value > Math.max(...otherZaps.map((z) => z.amount), 0));
$effect(() => {
    const v = Math.max(MIN_VALUE, Math.min(MAX_VALUE, initialValue));
    if (!isEditingAmount)
        value = v;
});
$effect(() => {
    if (!isEditingAmount) {
        amountInputValue = formatWithCommas(Math.round(value));
    }
});
function formatWithCommas(val) {
    return Math.round(val).toLocaleString("en-US");
}
/** Returns a CSS color string for a zap profile pubkey, adjusted for dark-mode text readability. */
function zapProfileColor(pubkey) {
    if (!pubkey) return "var(--white)";
    const base = hexToColor(pubkey);
    const adjusted = getProfileTextColor(base, true);
    return rgbToCssString(adjusted);
}
function formatMarkerLabel(val) {
    if (val >= 1000000)
        return `${Math.round(val / 1000000)}M`;
    if (val >= 1000)
        return `${Math.round(val / 1000)}K`;
    return val.toString();
}
function angleToValue(angle) {
    let adjustedAngle = angle - START_ANGLE;
    if (adjustedAngle < 0)
        adjustedAngle += 2 * Math.PI;
    adjustedAngle = Math.max(0, Math.min(TOTAL_ANGLE, adjustedAngle));
    const percentage = adjustedAngle / TOTAL_ANGLE;
    return normToValue(percentage);
}
function getPositionOnArc(angle, radius) {
    return {
        x: SIZE / 2 + radius * Math.cos(angle),
        y: SIZE / 2 + radius * Math.sin(angle),
    };
}
function handleInteraction(clientX, clientY) {
    if (!canvasElement)
        return;
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
function handlePointerDown(e) {
    isDragging = true;
    handleInteraction(e.clientX, e.clientY);
}
function handleTouchStart(e) {
    const t = e.touches[0];
    if (t) {
        isDragging = true;
        handleInteraction(t.clientX, t.clientY);
    }
}
function handlePointerMove(e) {
    if (!isDragging)
        return;
    e.preventDefault();
    handleInteraction(e.clientX, e.clientY);
}
function handlePointerUp() {
    isDragging = false;
}
function handleTouchMove(e) {
    if (!isDragging)
        return;
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
    if (!canvasElement)
        return;
    const ctx = canvasElement.getContext("2d");
    if (!ctx)
        return;
    const dpr = window.devicePixelRatio || 1;
    canvasElement.width = SIZE * dpr;
    canvasElement.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const centerX = SIZE / 2;
    const centerY = SIZE / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);
    otherZaps.forEach((zapData) => {
        const percentage = valueToNorm(zapData.amount);
        const angle = START_ANGLE + percentage * TOTAL_ANGLE;
        const innerRadius = RADIUS - BACKGROUND_THICKNESS / 2;
        const outerRadius = RADIUS + BACKGROUND_THICKNESS / 2 + MARKER_LENGTH + 6 + 9 - 10;
        const gradient = ctx.createLinearGradient(centerX + innerRadius * Math.cos(angle), centerY + innerRadius * Math.sin(angle), centerX + outerRadius * Math.cos(angle), centerY + outerRadius * Math.sin(angle));
        gradient.addColorStop(0, "#FFC736");
        gradient.addColorStop(1, "#FFA037");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 0.33;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(centerX + innerRadius * Math.cos(angle), centerY + innerRadius * Math.sin(angle));
        ctx.lineTo(centerX + outerRadius * Math.cos(angle), centerY + outerRadius * Math.sin(angle));
        ctx.stroke();
    });
    ctx.strokeStyle = "rgba(0, 0, 0, 0.33)";
    ctx.lineWidth = BACKGROUND_THICKNESS;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(centerX, centerY, RADIUS, START_ANGLE, START_ANGLE + TOTAL_ANGLE);
    ctx.stroke();
    markerValues.forEach((markerValue) => {
        const percentage = valueToNorm(markerValue);
        const angle = START_ANGLE + percentage * TOTAL_ANGLE;
        const innerRadius = RADIUS - BACKGROUND_THICKNESS / 2;
        const outerRadius = RADIUS + BACKGROUND_THICKNESS / 2 + MARKER_LENGTH;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.33)";
        ctx.lineWidth = 0.33;
        ctx.beginPath();
        ctx.moveTo(centerX + innerRadius * Math.cos(angle), centerY + innerRadius * Math.sin(angle));
        ctx.lineTo(centerX + outerRadius * Math.cos(angle), centerY + outerRadius * Math.sin(angle));
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
    const percentage = valueToNorm(value);
    const sweepAngle = percentage * TOTAL_ANGLE;
    if (sweepAngle > 0) {
        const gradient = ctx.createConicGradient(START_ANGLE - Math.PI / 2, centerX, centerY);
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
function handleAmountRowClick() {
    amountInputElement?.focus();
}
function handleAmountFocus() {
    isEditingAmount = true;
    amountInputValue = Math.round(value).toString();
    amountInputElement?.select();
}
function handleAmountInput(e) {
    const target = e.target;
    const cleaned = target.value.replace(/[^0-9]/g, "");
    const numValue = parseInt(cleaned, 10);
    if (cleaned === "" || isNaN(numValue)) {
        value = 0;
        // Let the bind keep whatever the user has typed (empty/partial)
    }
    else {
        // No MIN_VALUE clamp while typing — values < 10 show at slider min position
        value = Math.min(MAX_VALUE, numValue);
        // Only strip non-numeric characters; don't reformat while editing
        if (target.value !== cleaned) {
            amountInputValue = cleaned;
        }
    }
    onvalueChanged?.({ value });
    drawSlider();
}
function handleAmountBlur() {
    isEditingAmount = false;
    if (!value || value < 1) {
        value = 1;
    }
    amountInputValue = formatWithCommas(Math.round(value));
}
function handleAmountKeydown(e) {
    if (e.key === "Enter") {
        e.target.blur();
    }
}
function handleCommentSubmit(event) {
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
export function getValue() {
    return Math.round(value);
}
export function getMessage() {
    return message;
}
/** Same shape as ShortTextInput.getSerializedContent (for comments/zaps: text + emojiTags + mentions). */
export function getSerializedContent() {
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

      {#each otherZaps as zapData, i (i)}
        {@const percentage = valueToNorm(zapData.amount)}
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
          <div class="zap-tooltip" role="tooltip">
            <span
              class="zap-tooltip-name"
              style="color: {zapProfileColor(zapData.profile?.pubkey)};"
            >{zapData.profile?.name ?? "Anonymous"}</span>
            <div class="zap-tooltip-amount">
              <Zap variant="fill" size={12} color="url(#gold-gradient)" />
              <span>{formatWithCommas(zapData.amount)}</span>
            </div>
          </div>
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
          onfocus={handleAmountFocus}
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

    {#if !amountOnly}
      <div class="divider"></div>

      <ShortTextInput
        bind:this={shortTextInput}
        placeholder={effectivePlaceholder}
        {searchProfiles}
        {searchEmojis}
        size="small"
        showActionRow={true}
        hideTipButton={true}
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
    {/if}
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
  @media (min-width: 768px) {
    .zap-profile-marker {
      pointer-events: auto;
    }
    .zap-profile-marker:hover .zap-tooltip {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: none;
    }
  }
  .zap-tooltip {
    display: none;
  }
  @media (min-width: 768px) {
    .zap-tooltip {
      display: flex;
      flex-direction: column;
      gap: 2px;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      opacity: 0;
      transition: opacity 0.15s ease, transform 0.15s ease;
      background: var(--gray66);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 0.33px solid var(--white16);
      border-radius: 12px;
      box-shadow: 0 8px 32px var(--black33);
      padding: 8px 12px;
      white-space: nowrap;
      z-index: 10;
      pointer-events: none;
    }
  }
  .zap-tooltip-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
  }
  .zap-tooltip-amount {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--white66);
    line-height: 1.3;
  }
  .input-container {
    background: var(--black33);
    border-radius: var(--radius-16);
    border: 0.33px solid var(--white33);
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
    color: var(--white);
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
    color: var(--white33);
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
    height: 1px;
    background: var(--white8);
    margin: 0;
  }
</style>
