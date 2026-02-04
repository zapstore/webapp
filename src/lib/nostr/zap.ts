/**
 * Zap utilities (Lightning/NIP-57)
 *
 * Stub implementations; replace with real getZapEndpoint, createZapRequest,
 * requestZapInvoice, and receipt subscription when backend is ready.
 */

export interface ZapTarget {
  name?: string;
  pubkey?: string;
  dTag?: string;
  id?: string;
  pictureUrl?: string;
}

export interface CreateZapResult {
  invoice: string;
  zapRequest: { id: string };
}

/**
 * Create a zap request and get a Lightning invoice.
 * Stub: throws until implemented.
 */
export async function createZap(
  _target: ZapTarget | null,
  _amountSats: number,
  _comment = ''
): Promise<CreateZapResult> {
  throw new Error('Zap not yet implemented. Lightning invoice flow coming soon.');
}

export interface SubscribeToZapReceiptOptions {
  invoice?: string;
  appAddress?: string | null;
  appEventId?: string | null;
}

/**
 * Subscribe for a zap receipt (kind 9735) from the recipient.
 * Stub: returns a no-op unsubscribe.
 */
export function subscribeToZapReceipt(
  _recipientPubkey: string,
  _zapRequestId: string,
  _onReceipt: (receipt: unknown) => void,
  _options?: SubscribeToZapReceiptOptions
): () => void {
  return () => {};
}
