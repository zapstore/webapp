<script lang="ts">
  /**
   * ZapModal - Modal for sending a zap (Lightning tip).
   * Simplified: amount + message, callback when user confirms.
   * Full invoice/success flow can be added when createZap is implemented.
   */
  import Modal from "$lib/components/common/Modal.svelte";
  import ProfilePic from "$lib/components/common/ProfilePic.svelte";
  import { Zap } from "$lib/components/icons";
  import { getCurrentPubkey } from "$lib/stores/auth.svelte";

  interface ZapTarget {
    name?: string;
    pubkey?: string;
    dTag?: string;
    id?: string;
    pictureUrl?: string;
  }

  interface Props {
    isOpen?: boolean;
    target?: ZapTarget | null;
    publisherName?: string;
    onzap?: (event: { amount: number; message: string }) => void;
    onclose?: () => void;
  }

  let {
    isOpen = $bindable(false),
    target = null,
    publisherName = "",
    onzap,
    onclose,
  }: Props = $props();

  let zapValue = $state(100);
  let message = $state("");
  let loading = $state(false);
  let error = $state("");

  const presets = [21, 100, 500, 1000, 5000, 10000];
  const isConnected = $derived(getCurrentPubkey() !== null);

  function close() {
    isOpen = false;
    zapValue = 100;
    message = "";
    error = "";
    onclose?.();
  }

  function formatSats(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  async function handleZap() {
    if (loading || zapValue < 1) return;
    if (!isConnected) {
      error = "Sign in to zap";
      return;
    }
    loading = true;
    error = "";
    try {
      onzap?.({ amount: Math.round(zapValue), message: message.trim() });
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : "Zap failed";
    } finally {
      loading = false;
    }
  }
</script>

<Modal bind:open={isOpen} ariaLabel="Send a zap">
  <div class="zap-modal-content">
    {#if error}
      <p class="error-message">{error}</p>
    {/if}

    {#if !isConnected}
      <div class="sign-in-prompt">
        <div class="sign-in-icon">
          <Zap variant="fill" size={28} color="hsl(var(--goldColor))" />
        </div>
        <p class="sign-in-text">Sign in with your Nostr extension to send zaps.</p>
        <button type="button" class="btn-primary" onclick={close}>Close</button>
      </div>
    {:else}
      <!-- Target -->
      {#if target}
        <div class="zap-target">
          <ProfilePic
            pictureUrl={target.pictureUrl}
            name={target.name}
            pubkey={target.pubkey}
            size="lg"
          />
          <span class="zap-target-name">{target.name || publisherName || "App"}</span>
        </div>
      {/if}

      <!-- Amount presets -->
      <div class="amount-section">
        <label class="amount-label" for="zap-amount-slider">Amount (sats)</label>
        <div class="presets">
          {#each presets as p}
            <button
              type="button"
              class="preset-btn"
              class:active={zapValue === p}
              onclick={() => (zapValue = p)}
            >
              {formatSats(p)}
            </button>
          {/each}
        </div>
        <input
          id="zap-amount-slider"
          type="range"
          min="1"
          max="100000"
          step="1"
          bind:value={zapValue}
          class="amount-slider"
        />
        <p class="amount-value">{zapValue.toLocaleString()} sats</p>
      </div>

      <!-- Message -->
      <div class="message-section">
        <label class="message-label" for="zap-message-input">Message (optional)</label>
        <textarea
          id="zap-message-input"
          bind:value={message}
          class="message-input"
          placeholder="Add a comment..."
          rows="2"
        ></textarea>
      </div>

      <button
        type="button"
        class="btn-primary-large w-full zap-button"
        disabled={loading || zapValue < 1}
        onclick={handleZap}
      >
        <Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
        {loading ? "Sending…" : `Zap ${zapValue.toLocaleString()} sats`}
      </button>
    {/if}
  </div>
</Modal>

<style>
  .zap-modal-content {
    padding: 16px;
  }

  .error-message {
    padding: 12px;
    margin-bottom: 16px;
    background: hsl(var(--destructive) / 0.1);
    border-radius: var(--radius-12);
    color: hsl(var(--destructive));
    font-size: 14px;
  }

  .sign-in-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
    text-align: center;
  }

  .sign-in-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: hsl(var(--goldColor) / 0.1);
    border-radius: 50%;
    margin-bottom: 16px;
  }

  .sign-in-text {
    color: hsl(var(--white66));
    font-size: 14px;
    margin-bottom: 20px;
  }

  .zap-target {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .zap-target-name {
    font-weight: 600;
    color: hsl(var(--white));
  }

  .amount-section {
    margin-bottom: 16px;
  }

  .amount-label,
  .message-label {
    display: block;
    font-size: 0.875rem;
    color: hsl(var(--white66));
    margin-bottom: 8px;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .preset-btn {
    padding: 6px 12px;
    border-radius: 9999px;
    border: 0.33px solid hsl(var(--white33));
    background: hsl(var(--black33));
    color: hsl(var(--white66));
    font-size: 0.875rem;
    cursor: pointer;
  }

  .preset-btn:hover,
  .preset-btn.active {
    background: hsl(var(--white16));
    color: hsl(var(--white));
  }

  .amount-slider {
    width: 100%;
    margin-bottom: 8px;
  }

  .amount-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: hsl(var(--goldColor));
  }

  .message-section {
    margin-bottom: 20px;
  }

  .message-input {
    width: 100%;
    padding: 12px;
    border-radius: var(--radius-16);
    border: 0.33px solid hsl(var(--white33));
    background: hsl(var(--black33));
    color: hsl(var(--white));
    font-size: 1rem;
    resize: vertical;
    min-height: 60px;
  }

  .message-input::placeholder {
    color: hsl(var(--white33));
  }

  .zap-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
</style>
