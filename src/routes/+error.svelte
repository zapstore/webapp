<script lang="js">
import { page } from '$app/stores';
import { browser } from '$app/environment';
import { isOnline } from '$lib/stores/online.svelte.js';
import ZappyError from '$lib/components/common/ZappyError.svelte';

let online = $derived(browser ? isOnline() : true);
let status = $derived($page.status);
let rawMessage = $derived($page.error?.message ?? 'Something went wrong');

let isOfflineError = $derived(
	!online || status === 503 || rawMessage.includes('NetworkError') || rawMessage.includes('fetch')
);

let message = $derived(
	isOfflineError
		? "you're offline. Previously visited pages still work, but this one needs a connection."
		: status === 404
			? "this page doesn't exist."
			: "something went wrong on our end."
);
</script>

<ZappyError {message} />
