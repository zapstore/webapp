<script lang="ts">
  /**
   * ZapSliderModal - Full zap flow: slider amount + comment, then invoice QR + copy + open in wallet, then success.
   * Aligned with local-first ARCHITECTURE; invoice from LNURL, receipt via relay subscription + EventStore.
   */
  import { onDestroy } from "svelte";
  import { Loader2, AlertCircle, CheckCircle, Copy, Check, ExternalLink } from "lucide-svelte";
  import { createZap, subscribeToZapReceipt } from "$lib/nostr";
  import { getIsSignedIn, getIsConnecting, connect, signEvent } from "$lib/stores/auth.svelte";
  import Modal from "$lib/components/common/Modal.svelte";
  import ZapSlider from "./ZapSlider.svelte";
  import Zap from "$lib/components/icons/Zap.svelte";

  type ProfileHit = { pubkey: string; name?: string; displayName?: string; picture?: string };
  type EmojiHit = { shortcode: string; url: string; source: string };

  interface ZapTarget {
    name?: string;
    pubkey?: string;
    dTag?: string;
    id?: string;
    pictureUrl?: string;
  }

  interface OtherZap {
    amount: number;
    profile?: { pictureUrl?: string; name?: string; pubkey?: string };
  }

  interface Props {
    target?: ZapTarget | null;
    publisherName?: string;
    otherZaps?: OtherZap[];
    isOpen?: boolean;
    /** When true, no backdrop overlay (e.g. opened from inside another modal) */
    nestedModal?: boolean;
    searchProfiles?: (query: string) => Promise<ProfileHit[]>;
    searchEmojis?: (query: string) => Promise<EmojiHit[]>;
    onclose?: (event: { success: boolean }) => void;
    onzapReceived?: (event: { zapReceipt: unknown }) => void;
  }

  let {
    target = null,
    publisherName = "",
    otherZaps = [],
    isOpen = $bindable(false),
    nestedModal = false,
    searchProfiles = async () => [],
    searchEmojis = async () => [],
    onclose,
    onzapReceived,
  }: Props = $props();

  let sliderComponent = $state<{
    getValue: () => number;
    getMessage: () => string;
    getSerializedContent?: () => { text: string; emojiTags: { shortcode: string; url: string }[]; mentions: string[] };
  } | null>(null);
  let zapValue = $state(100);
  let message = $state("");
  let loading = $state(false);
  let error = $state("");
  let invoice = $state<string | null>(null);
  let zapRequest = $state<{ id: string } | null>(null);
  let copied = $state(false);
  let step = $state<"slider" | "invoice" | "success">("slider");
  let unsubscribe: (() => void) | null = null;
  let waitingForReceipt = $state(false);
  let showManualClose = $state(false);
  let receiptTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastEmojiTags = $state<{ shortcode: string; url: string }[]>([]);

  const isConnected = $derived(getIsSignedIn());
  const isConnecting = $derived(getIsConnecting());

  const qrCodeUrl = $derived(
    invoice
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=ffffff&color=000000&data=${encodeURIComponent("lightning:" + invoice.toUpperCase())}`
      : null
  );

  const targetProfile = $derived(
    target
      ? { pictureUrl: target.pictureUrl, name: target.name, pubkey: target.pubkey }
      : null
  );

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (receiptTimeout) {
      clearTimeout(receiptTimeout);
      receiptTimeout = null;
    }
  }

  function close(zapSuccessful = false) {
    cleanup();
    zapValue = 100;
    message = "";
    loading = false;
    error = "";
    invoice = null;
    zapRequest = null;
    step = "slider";
    waitingForReceipt = false;
    showManualClose = false;
    isOpen = false;
    onclose?.({ success: zapSuccessful });
  }

  function handleValueChanged(e: { value: number }) {
    zapValue = e.value;
  }

  function handleSendZap(e: {
    amount: number;
    message: string;
    emojiTags: { shortcode: string; url: string }[];
    mentions: string[];
  }) {
    zapValue = e.amount;
    message = e.message;
    lastEmojiTags = e.emojiTags ?? [];
    handleZap();
  }

  async function handleSignIn() {
    try {
      await connect();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to sign in";
    }
  }

  async function handleZap() {
    if (loading || zapValue < 1) return;
    loading = true;
    error = "";
    try {
      // Use serialized content from slider when available (same as comments: text + emojiTags + mentions)
      const serialized = sliderComponent?.getSerializedContent?.();
      const commentText = serialized?.text?.trim() ?? message;
      const emojiTagsToSend = (serialized?.emojiTags?.length ? serialized.emojiTags : lastEmojiTags) ?? [];
      const result = await createZap(
        target,
        Math.round(zapValue),
        commentText,
        signEvent as (t: import("nostr-tools/pure").EventTemplate) => Promise<unknown>,
        emojiTagsToSend.length ? emojiTagsToSend : undefined
      );
      invoice = result.invoice;
      zapRequest = result.zapRequest;
      step = "invoice";
      waitingForReceipt = true;
      startListeningForReceipt();
    } catch (err) {
      console.error("Zap failed:", err);
      error = err instanceof Error ? err.message : "Failed to create zap";
    } finally {
      loading = false;
    }
  }

  function startListeningForReceipt() {
    if (!zapRequest || !target?.pubkey) return;
    const targetAddress = target.dTag ? `32267:${target.pubkey}:${target.dTag}` : null;
    unsubscribe = subscribeToZapReceipt(
      target.pubkey,
      zapRequest.id,
      (zapReceipt) => {
        if (receiptTimeout) {
          clearTimeout(receiptTimeout);
          receiptTimeout = null;
        }
        waitingForReceipt = false;
        step = "success";
        onzapReceived?.({ zapReceipt });
        setTimeout(() => close(true), 2000);
      },
      { invoice: invoice ?? undefined, appAddress: targetAddress, appEventId: target.id }
    );
    receiptTimeout = setTimeout(() => {
      showManualClose = true;
    }, 30000);
  }

  function handleManualDone() {
    close(true);
  }

  async function copyInvoice() {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  function goBack() {
    cleanup();
    step = "slider";
    invoice = null;
    zapRequest = null;
    error = "";
    waitingForReceipt = false;
    showManualClose = false;
  }

  function formatAmount(val: number): string {
    return Math.round(val).toLocaleString("en-US");
  }

  onDestroy(() => cleanup());

  $effect(() => {
    if (!isOpen) cleanup();
  });
</script>

<Modal
  bind:open={isOpen}
  ariaLabel="Zap {target?.name ?? 'Content'}"
  wide={true}
  align="bottom"
  noBackdrop={nestedModal}
>
  <div class="zap-modal-content">
    {#if error}
      <div class="error-message">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    {/if}

    {#if !isConnected}
      <div class="sign-in-prompt">
        <div class="sign-in-icon">
          <Zap variant="fill" size={32} color="hsl(var(--goldColor))" />
        </div>
        <p class="sign-in-text">Sign in with Nostr to send zaps</p>
        <button
          type="button"
          class="btn-primary-large"
          onclick={handleSignIn}
          disabled={isConnecting}
        >
          {#if isConnecting}
            <Loader2 size={18} class="animate-spin" />
            <span>Connecting...</span>
          {:else}
            <span>Sign in with Nostr</span>
          {/if}
        </button>
      </div>
    {:else if step === "slider"}
      <div class="pt-4">
        <h2 class="text-display text-4xl text-foreground text-center mb-2">Zap</h2>
        <p class="text-base text-muted-foreground text-center mb-4">
          {publisherName || "Creator"} for publishing {target?.name ?? "this content"}
        </p>
      </div>
      <div class="slider-wrapper">
        <ZapSlider
          bind:this={sliderComponent}
          profile={targetProfile}
          initialValue={zapValue}
          {otherZaps}
          bind:message
          {searchProfiles}
          {searchEmojis}
          placeholder="Comment on {target?.name ?? 'this'}"
          onvalueChanged={handleValueChanged}
          onsendZap={handleSendZap}
        />
      </div>
    {:else if step === "invoice"}
      <div class="invoice-view">
        <div class="invoice-header">
          <span class="invoice-amount">{formatAmount(Math.round(zapValue))}</span>
          {#if message}
            <span class="invoice-message">"{message}"</span>
          {/if}
        </div>
        <!-- QR + Copy block (DownloadModal-style: rounded box, copy link row) -->
        <div class="invoice-card">
          <div class="qr-row">
            <div class="qr-wrap">
              {#if qrCodeUrl}
                <a
                  href={invoice ? `lightning:${invoice}` : "#"}
                  class="qr-link"
                  title="Open in Lightning wallet"
                >
                  <img
                    src={qrCodeUrl}
                    alt="Lightning Invoice QR Code"
                    class="qr-image"
                    loading="eager"
                  />
                </a>
              {/if}
            </div>
            <button
              type="button"
              class="copy-invoice-btn"
              onclick={copyInvoice}
              title="Copy BOLT11 invoice"
            >
              {#if copied}
                <Check size={18} class="text-green-500 flex-shrink-0" />
                <span>Copied!</span>
              {:else}
                <Copy size={18} class="flex-shrink-0" />
                <span>Copy Invoice</span>
              {/if}
            </button>
          </div>
          <a
            href={invoice ? `lightning:${invoice}` : "#"}
            class="open-wallet-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={18} class="flex-shrink-0" />
            <span>Open in Alby / Wallet</span>
          </a>
        </div>
        <p class="invoice-status">
          {#if waitingForReceipt}
            <span class="waiting-status">
              <Loader2 size={14} class="animate-spin" />
              <span>Waiting for payment...</span>
            </span>
          {:else}
            Scan with a Lightning wallet or open in Alby / browser wallet
          {/if}
        </p>
        {#if showManualClose}
          <div class="manual-done-section">
            <p class="manual-done-text">Payment not automatically detected. If you've paid:</p>
            <button type="button" class="manual-done-button" onclick={handleManualDone}>
              <CheckCircle size={16} />
              <span>I've paid, close this</span>
            </button>
          </div>
        {/if}
        <button type="button" class="back-button" onclick={goBack}>← Change amount</button>
      </div>
    {:else if step === "success"}
      <div class="success-view">
        <div class="success-icon">
          <CheckCircle size={48} class="text-green-500" />
        </div>
        <h3 class="success-title">Zap Sent!</h3>
        <p class="success-message">{formatAmount(Math.round(zapValue))} zapped successfully</p>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .zap-modal-content {
    padding: 16px;
  }
  @media (min-width: 768px) {
    .zap-modal-content {
      padding: 12px;
    }
  }
  .error-message {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    margin-bottom: 16px;
    background: hsl(var(--destructive) / 0.1);
    border: 0.33px solid hsl(var(--destructive) / 0.4);
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
  .invoice-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .invoice-header {
    text-align: center;
  }
  .invoice-amount {
    display: block;
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--goldColor));
  }
  .invoice-message {
    display: block;
    font-size: 14px;
    color: hsl(var(--white66));
    margin-top: 4px;
  }
  .invoice-card {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: hsl(var(--white8));
    border: 1px solid hsl(var(--border) / 0.4);
    border-radius: var(--radius-16);
  }
  .qr-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .qr-wrap {
    flex-shrink: 0;
  }
  .qr-link {
    display: block;
    padding: 8px;
    background: white;
    border-radius: 12px;
    border: 1px solid hsl(var(--border) / 0.4);
    transition: box-shadow 0.15s ease;
  }
  .qr-link:hover {
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  }
  .qr-image {
    width: 128px;
    height: 128px;
    display: block;
  }
  .copy-invoice-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    color: hsl(var(--white66));
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .copy-invoice-btn:hover {
    color: hsl(var(--foreground));
  }
  .open-wallet-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: hsl(var(--goldColor) / 0.15);
    border: 0.33px solid hsl(var(--goldColor) / 0.4);
    border-radius: var(--radius-12);
    color: hsl(var(--goldColor));
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  .open-wallet-btn:hover {
    background: hsl(var(--goldColor) / 0.25);
    border-color: hsl(var(--goldColor) / 0.6);
  }
  .invoice-status {
    font-size: 12px;
    color: hsl(var(--white66));
    text-align: center;
  }
  .waiting-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .manual-done-section {
    width: 100%;
    padding-top: 16px;
    border-top: 0.33px solid hsl(var(--white16));
  }
  .manual-done-text {
    font-size: 12px;
    color: hsl(var(--white66));
    text-align: center;
    margin-bottom: 12px;
  }
  .manual-done-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: hsl(142 76% 36%);
    border: none;
    border-radius: var(--radius-12);
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .manual-done-button:hover {
    background: hsl(142 76% 30%);
  }
  .back-button {
    padding: 8px 16px;
    background: transparent;
    border: none;
    color: hsl(var(--white66));
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .back-button:hover {
    color: hsl(var(--white));
  }
  .success-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
    text-align: center;
  }
  .success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: hsl(142 76% 36% / 0.1);
    border-radius: 50%;
    margin-bottom: 16px;
    color: hsl(142 76% 36%);
  }
  .success-title {
    font-size: 24px;
    font-weight: 700;
    color: hsl(142 76% 36%);
    margin: 0 0 8px;
  }
  .success-message {
    font-size: 14px;
    color: hsl(var(--white66));
    margin: 0;
  }
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
