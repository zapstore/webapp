<script lang="ts">
  /**
   * ZapSliderModal - Full zap flow: slider amount + comment, then invoice QR + copy + open in wallet, then success.
   * Aligned with local-first ARCHITECTURE; invoice from LNURL, receipt via relay subscription + EventStore.
   */
  import { onDestroy } from "svelte";
  import { Loader2, AlertCircle, CheckCircle, Copy, Check } from "lucide-svelte";
  import { generateSecretKey, finalizeEvent } from "nostr-tools/pure";
  import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
  import { createZap, subscribeToZapReceipt } from "$lib/nostr";
  import { getIsSignedIn, signEvent } from "$lib/stores/auth.svelte";
  import Modal from "$lib/components/common/Modal.svelte";
  import ZapSlider from "./ZapSlider.svelte";
  import Zap from "$lib/components/icons/Zap.svelte";

  /** Sign zap request with a fresh random keypair (for guest zaps). */
  async function signWithAnonymousKey(template: EventTemplate): Promise<NostrEvent> {
    const sk = generateSecretKey();
    return finalizeEvent(template, sk) as NostrEvent;
  }

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
  let invoiceLoading = $state(false);
  let zapRequest = $state<{ id: string } | null>(null);
  let copied = $state(false);
  let step = $state<"slider" | "invoice" | "success">("slider");
  let unsubscribe: (() => void) | null = null;
  let waitingForReceipt = $state(false);
  let showManualClose = $state(false);
  let receiptTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastEmojiTags = $state<{ shortcode: string; url: string }[]>([]);

  const isConnected = $derived(getIsSignedIn());

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
    invoiceLoading = false;
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

  async function handleZap() {
    if (loading || zapValue < 1) return;
    // Show invoice step immediately with skeleton; createZap runs in background
    step = "invoice";
    invoice = null;
    invoiceLoading = true;
    waitingForReceipt = true;
    loading = true;
    error = "";
    try {
      const serialized = sliderComponent?.getSerializedContent?.();
      const commentText = serialized?.text?.trim() ?? message;
      const emojiTagsToSend = (serialized?.emojiTags?.length ? serialized.emojiTags : lastEmojiTags) ?? [];
      const signer = isConnected
        ? (signEvent as (t: EventTemplate) => Promise<unknown>)
        : signWithAnonymousKey;
      const result = await createZap(
        target,
        Math.round(zapValue),
        commentText,
        signer,
        emojiTagsToSend.length ? emojiTagsToSend : undefined
      );
      invoice = result.invoice;
      zapRequest = result.zapRequest;
      startListeningForReceipt();
      // Trigger browser wallet (Alby etc.) immediately when invoice is ready
      if (result.invoice) {
        queueMicrotask(() => openInWallet(result.invoice!));
      }
    } catch (err) {
      console.error("Zap failed:", err);
      error = err instanceof Error ? err.message : "Failed to create zap";
      step = "slider";
      waitingForReceipt = false;
    } finally {
      loading = false;
      invoiceLoading = false;
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

  /** Try WebLN (Alby etc.) first, then fall back to lightning: URL so the browser can open a wallet. */
  async function openInWallet(bolt11: string) {
    const w = typeof window !== "undefined" ? (window as { webln?: { enable: () => Promise<void>; sendPayment: (inv: string) => Promise<{ preimage: string }> } }).webln : undefined;
    if (w) {
      try {
        await w.enable();
        await w.sendPayment(bolt11);
        // Payment sent; receipt listener will handle success
      } catch (e) {
        // User rejected or error; fall back to lightning: so another handler can try
        try {
          const a = document.createElement("a");
          a.href = `lightning:${bolt11}`;
          a.rel = "noopener noreferrer";
          a.target = "_blank";
          a.click();
        } catch {
          // ignore
        }
      }
    } else {
      const a = document.createElement("a");
      a.href = `lightning:${bolt11}`;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      a.click();
    }
  }

  function goBack() {
    cleanup();
    step = "slider";
    invoice = null;
    invoiceLoading = false;
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

    {#if step === "slider"}
      <!-- Same zap flow for guest (anon keypair) and signed-in users -->
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
        <h2 class="invoice-title">Invoice</h2>
        <div class="invoice-qr-block">
          {#if invoiceLoading || !qrCodeUrl}
            <div class="invoice-qr-skeleton" aria-hidden="true"></div>
          {:else}
            <a
              href={invoice ? `lightning:${invoice}` : "#"}
              class="invoice-qr-link"
              title="Open in Lightning wallet"
            >
              <img
                src={qrCodeUrl}
                alt="Lightning Invoice QR Code"
                class="invoice-qr-image"
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
          disabled={!invoice}
        >
          {#if copied}
            <Check size={18} class="flex-shrink-0" style="color: hsl(var(--blurpleColor));" />
            <span>Copied!</span>
          {:else}
            <Copy size={18} class="flex-shrink-0" />
            <span>Copy link</span>
          {/if}
        </button>
        <div class="invoice-button-row">
          <button type="button" class="invoice-back-btn" onclick={goBack}>Back</button>
          {#if showManualClose}
            <button type="button" class="invoice-done-btn" onclick={handleManualDone}>
              <CheckCircle size={16} class="flex-shrink-0" />
              <span>I've paid. Close this</span>
            </button>
          {:else}
            <button type="button" class="invoice-waiting-btn" disabled>
              <Loader2 size={16} class="animate-spin flex-shrink-0" />
              <span>Waiting for payment</span>
            </button>
          {/if}
        </div>
      </div>
    {:else if step === "success"}
      <div class="success-view">
        <div class="success-icon">
          <CheckCircle size={48} style="color: hsl(var(--blurpleColor));" />
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
  .invoice-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .invoice-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0 0 8px;
  }
  .invoice-qr-block {
    flex-shrink: 0;
  }
  .invoice-qr-skeleton {
    width: 200px;
    height: 200px;
    background: hsl(var(--white16));
    border-radius: 12px;
    animation: invoice-skeleton-pulse 1.2s ease-in-out infinite;
  }
  @keyframes invoice-skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  .invoice-qr-link {
    display: block;
    padding: 8px;
    background: white;
    border-radius: 12px;
    border: 1px solid hsl(var(--border) / 0.4);
    transition: box-shadow 0.15s ease;
  }
  .invoice-qr-link:hover {
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  }
  .invoice-qr-image {
    width: 200px;
    height: 200px;
    display: block;
  }
  .copy-invoice-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    color: hsl(var(--white66));
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .copy-invoice-btn:hover:not(:disabled) {
    color: hsl(var(--foreground));
  }
  .copy-invoice-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .invoice-button-row {
    display: flex;
    flex-direction: row;
    gap: 12px;
    width: 100%;
    align-items: stretch;
  }
  .invoice-back-btn {
    padding: 12px 16px;
    background: hsl(var(--black33));
    border: none;
    border-radius: var(--radius-12);
    color: hsl(var(--white66));
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease, background-color 0.15s ease;
  }
  .invoice-back-btn:hover {
    color: hsl(var(--white));
    background: hsl(var(--white16));
  }
  .invoice-waiting-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    background: hsl(var(--blurpleColor33));
    border: none;
    border-radius: var(--radius-12);
    color: hsl(var(--white66));
    font-size: 14px;
    cursor: not-allowed;
  }
  .invoice-done-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    background: hsl(var(--blurpleColor));
    border: none;
    border-radius: var(--radius-12);
    color: hsl(var(--whiteEnforced));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  .invoice-done-btn:hover {
    opacity: 0.9;
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
    background: hsl(var(--blurpleColor) / 0.15);
    border-radius: 50%;
    margin-bottom: 16px;
  }
  .success-title {
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--blurpleColor));
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
