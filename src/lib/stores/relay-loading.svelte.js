/**
 * Shared relay-loading flags — set by shell components, read by layout sidebar.
 * Tiny $state object so any component can import and mutate reactively.
 */
export const relayLoading = $state({ forum: false, activity: false });
