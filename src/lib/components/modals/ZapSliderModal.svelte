<script lang="js">
/**
 * ZapSliderModal - Full zap flow: slider amount + comment, then invoice QR + copy + open in wallet, then success.
 * Aligned with local-first ARCHITECTURE; invoice from LNURL, receipt via relay subscription + EventStore.
 */
import { onDestroy } from "svelte";
import { Loader2, AlertCircle, CheckCircle, Copy, Check } from "lucide-svelte";
import { generateSecretKey, finalizeEvent } from "nostr-tools/pure";
import { createZap, subscribeToZapReceipt } from "$lib/nostr";
import { getIsSignedIn, signEvent } from "$lib/stores/auth.svelte.js";
import Modal from "$lib/components/common/Modal.svelte";
import ZapSlider from "./ZapSlider.svelte";
/** Sign zap request with a fresh random keypair (for guest zaps). */
async function signWithAnonymousKey(template) {
    const sk = generateSecretKey();
    return finalizeEvent(template, sk);
}
let { target = null, publisherName = "", otherZaps = [], isOpen = $bindable(false), nestedModal = false, lockBodyScroll = true, scopedInPanel = false, zIndex = 50, searchProfiles = async () => [], searchEmojis = async () => [], onclose, onzapReceived, onZapPending, onZapPendingClear, /** When set, opening the modal pre-fills this amount on the slider (e.g. quick chips). */
presetZapSats = null, } = $props();
let sliderComponent = $state(null);
let zapValue = $state(100);
let message = $state("");
let loading = $state(false);
let error = $state("");
let invoice = $state(null);
let invoiceLoading = $state(false);
let zapRequest = $state(null);
let copied = $state(false);
let step = $state("slider");
let unsubscribe = null;
let _waitingForReceipt = $state(false);
let showManualClose = $state(false);
let receiptTimeout = null;
let lastEmojiTags = $state([]);
/** Optimistic UI: temp row id until receipt or cancel */
let pendingTempId = $state(null);
const isConnected = $derived(getIsSignedIn());
const qrCodeUrl = $derived(invoice
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=ffffff&color=000000&data=${encodeURIComponent("lightning:" + invoice.toUpperCase())}`
    : null);
const targetProfile = $derived(target
    ? { pictureUrl: target.pictureUrl, name: target.name, pubkey: target.pubkey }
    : null);
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
function resetZapFormState() {
    zapValue = 100;
    message = "";
    loading = false;
    invoiceLoading = false;
    error = "";
    invoice = null;
    zapRequest = null;
    step = "slider";
    _waitingForReceipt = false;
    showManualClose = false;
}
/** Successful close after receipt (pending row already cleared in parent). */
function closeAfterSuccess() {
    cleanup();
    resetZapFormState();
    pendingTempId = null;
    isOpen = false;
    onclose?.({ success: true });
}
function handleValueChanged(e) {
    zapValue = e.value;
}
function handleSendZap(e) {
    zapValue = e.amount;
    message = e.message;
    lastEmojiTags = e.emojiTags ?? [];
    handleZap();
}
async function handleZap() {
    if (loading || zapValue < 1)
        return;
    // Show invoice step immediately with skeleton; createZap runs in background
    step = "invoice";
    invoice = null;
    invoiceLoading = true;
    _waitingForReceipt = true;
    loading = true;
    error = "";
    try {
        const serialized = sliderComponent?.getSerializedContent?.();
        const commentText = serialized?.text?.trim() ?? message;
        const emojiTagsToSend = (serialized?.emojiTags?.length ? serialized.emojiTags : lastEmojiTags) ?? [];
        const signer = isConnected
            ? signEvent
            : signWithAnonymousKey;
        const result = await createZap(target, Math.round(zapValue), commentText, signer, emojiTagsToSend.length ? emojiTagsToSend : undefined);
        invoice = result.invoice;
        zapRequest = result.zapRequest;
        const tempId = `pending-zap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        pendingTempId = tempId;
        const zid = target?.id?.trim?.() ?? "";
        const zappedEventId = /^[a-f0-9]{64}$/i.test(zid) ? zid.toLowerCase() : undefined;
        onZapPending?.({
            tempId,
            amountSats: Math.round(zapValue),
            comment: commentText,
            emojiTags: emojiTagsToSend,
            zappedEventId,
            recipientPubkey: target?.pubkey,
        });
        startListeningForReceipt();
        // Trigger browser wallet (Alby etc.) immediately when invoice is ready
        if (result.invoice) {
            queueMicrotask(() => openInWallet(result.invoice));
        }
    }
    catch (err) {
        console.error("Zap failed:", err);
        error = err instanceof Error ? err.message : "Failed to create zap";
        step = "slider";
        _waitingForReceipt = false;
    }
    finally {
        loading = false;
        invoiceLoading = false;
    }
}
function startListeningForReceipt() {
    if (!zapRequest || !target?.pubkey)
        return;
    const targetAddress = target.dTag ? `32267:${target.pubkey}:${target.dTag}` : null;
    unsubscribe = subscribeToZapReceipt(target.pubkey, zapRequest.id, (zapReceipt) => {
        if (receiptTimeout) {
            clearTimeout(receiptTimeout);
            receiptTimeout = null;
        }
        _waitingForReceipt = false;
        step = "success";
        const temp = pendingTempId;
        pendingTempId = null;
        onzapReceived?.({ zapReceipt, pendingTempId: temp });
        setTimeout(() => closeAfterSuccess(), 2000);
    }, { invoice: invoice ?? undefined, appAddress: targetAddress, appEventId: target.id });
    receiptTimeout = setTimeout(() => {
        showManualClose = true;
    }, 30000);
}
function handleManualDone() {
    const temp = pendingTempId;
    pendingTempId = null;
    if (temp)
        onZapPendingClear?.(temp);
    cleanup();
    resetZapFormState();
    isOpen = false;
    onzapReceived?.({ zapReceipt: {}, pendingTempId: null });
    onclose?.({ success: true });
}
async function copyInvoice() {
    if (!invoice)
        return;
    try {
        await navigator.clipboard.writeText(invoice);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }
    catch (err) {
        console.error("Failed to copy:", err);
    }
}
/** Try WebLN (Alby etc.) first, then fall back to lightning: URL so the browser can open a wallet. */
async function openInWallet(bolt11) {
    const w = typeof window !== "undefined" ? window.webln : undefined;
    if (w) {
        try {
            await w.enable();
            await w.sendPayment(bolt11);
            // Payment sent; receipt listener will handle success
        }
        catch (_e) {
            // User rejected or error; fall back to lightning: so another handler can try
            try {
                const a = document.createElement("a");
                a.href = `lightning:${bolt11}`;
                a.rel = "noopener noreferrer";
                a.target = "_blank";
                a.click();
            }
            catch {
                // ignore
            }
        }
    }
    else {
        const a = document.createElement("a");
        a.href = `lightning:${bolt11}`;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        a.click();
    }
}
function goBack() {
    const temp = pendingTempId;
    pendingTempId = null;
    if (temp)
        onZapPendingClear?.(temp);
    cleanup();
    step = "slider";
    invoice = null;
    invoiceLoading = false;
    zapRequest = null;
    error = "";
    _waitingForReceipt = false;
    showManualClose = false;
}
function formatAmount(val) {
    return Math.round(val).toLocaleString("en-US");
}
onDestroy(() => cleanup());
let _prevIsOpen = $state(false);
$effect(() => {
    if (!_prevIsOpen && isOpen) {
        const p = presetZapSats != null ? Number(presetZapSats) : NaN;
        if (Number.isFinite(p) && p >= 1) {
            zapValue = Math.round(p);
        }
    }
    if (_prevIsOpen && !isOpen) {
        if (pendingTempId) {
            onZapPendingClear?.(pendingTempId);
            pendingTempId = null;
        }
        cleanup();
        resetZapFormState();
    }
    _prevIsOpen = isOpen;
});
</script>

<Modal
  bind:open={isOpen}
  ariaLabel="Zap {target?.name ?? 'Content'}"
  wide={true}
  align="bottom"
  noBackdrop={nestedModal}
  {zIndex}
  lockBodyScroll={lockBodyScroll}
  {scopedInPanel}
  class="zap-slider-modal"
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
        <h2 class="modal-title text-display text-4xl text-foreground text-center mb-2">Zap</h2>
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
        <h2 class="modal-title invoice-title text-display text-foreground text-center">Invoice</h2>
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
        <h2 class="modal-title success-title text-display text-foreground text-center">Zap Sent!</h2>
        <p class="success-message">{formatAmount(Math.round(zapValue))} zapped successfully</p>
      </div>
    {/if}
  </div>
</Modal>

<style>
  :global(.zap-slider-modal.modal-scoped-in-panel .modal-content) {
    padding-bottom: 0;
  }

  .modal-title {
    font-size: 1.875rem;
  }

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
    background: hsl(var(--rougeColor) / 0.1);
    border: 0.33px solid hsl(var(--rougeColor) / 0.4);
    border-radius: var(--radius-12);
    color: hsl(var(--rougeColor));
    font-size: 14px;
  }
  .invoice-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .invoice-title {
    font-size: 1.875rem;
    color: hsl(var(--white));
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
    color: hsl(var(--white));
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
    font-size: 1.875rem;
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
