/**
 * Stores module exports
 */

export * from './catalogs.svelte';
export * from './auth.svelte';
export * from './online.svelte';

// Re-export nostr store (apps) with explicit names
export {
	getHasMore,
	isLoadingMore,
	isRefreshing,
	getApps,
	loadMore,
	scheduleRefresh,
	resetStore,
	initWithPrerenderedData,
	isStoreInitialized
} from './nostr.svelte';

// Re-export stacks store with renamed exports to avoid conflicts
export {
	getHasMore as getStacksHasMore,
	isLoadingMore as isStacksLoadingMore,
	isRefreshing as isStacksRefreshing,
	getStacks,
	loadMoreStacks,
	scheduleStacksRefresh,
	resetStacksStore,
	initWithPrerenderedStacks,
	isStacksInitialized,
	getResolvedStacks,
	setResolvedStacks
} from './stacks.svelte';
