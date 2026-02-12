<script>
	import { onMount } from 'svelte';
	import LandingSectionTitle from './LandingSectionTitle.svelte';
	import TaskBox from '$lib/components/common/TaskBox.svelte';

	// Sample tasks with different statuses and estimated delivery
	const tasks = [
		{
			id: 1,
			title: 'iOS App Release',
			description: 'Launch Zapstore on iOS with full feature parity',
			status: 'open',
			eta: 'Q3 2026'
		},
		{
			id: 2,
			title: 'Developer Analytics',
			description: 'Insights dashboard for app publishers',
			status: 'inProgress',
			eta: 'NEXT 3 MONTHS'
		},
		{
			id: 3,
			title: 'Zapstore Studio',
			description: 'Tools for building and publishing apps on Zapstore',
			status: 'inProgress',
			eta: 'NEXT 3 MONTHS'
		},
		{
			id: 4,
			title: 'Web App',
			description: 'Build out social features on web',
			status: 'inReview',
			eta: 'NEXT 2 MONTHS'
		},
		{
			id: 5,
			title: 'Decentralize App Catalogs',
			description: 'Let users browse and create any app catalog',
			status: 'inReview',
			eta: 'NEXT 2 MONTHS'
		},
		{
			id: 6,
			title: 'App Stacks',
			description: 'Let users curate lists of apps',
			status: 'closed',
			eta: 'COMPLETED'
		},
		{
			id: 7,
			title: 'Android App 1.0',
			description: 'Finalize stable version of the mobile app on Android',
			status: 'closed',
			eta: 'COMPLETED'
		}
	];
	/** @typedef {'closed'|'inReview'|'inProgress'|'open'} TaskStatus */

	// Sort tasks: closed first (partially visible), then inReview, inProgress, open
	/** @type {Record<TaskStatus, number>} */
	const statusOrder = { closed: 0, inReview: 1, inProgress: 2, open: 3 };
	$: sortedTasks = [...tasks].sort(
		(a, b) => statusOrder[/** @type {TaskStatus} */ (a.status)] - statusOrder[/** @type {TaskStatus} */ (b.status)]
	);

	/** @type {HTMLDivElement | null} */
	let scrollContainer = null;
	let initialScrollSet = false;

	onMount(() => {
		// Set initial scroll position to show last done task partially visible on the left
		if (scrollContainer && !initialScrollSet) {
			// Small delay to ensure layout is complete
			setTimeout(() => {
				// Calculate how much to scroll to show part of the last done task
				const closedTasks = tasks.filter((t) => t.status === 'closed').length;
				if (closedTasks > 0) {
					// Scroll to show most of the first non-closed task, with closed partially visible
					const cardWidth = 320; // Approximate card width
					const gap = 24;
					// Show about 80px of the last closed task
					const scrollTo = Math.max(0, (closedTasks - 1) * (cardWidth + gap) + cardWidth - 80);
					const container = scrollContainer;
					if (container) container.scrollLeft = scrollTo;
				}
				initialScrollSet = true;
			}, 100);
		}
	});
</script>

<section class="border-t border-border/50 py-8 sm:py-12 lg:py-16">
	<LandingSectionTitle
		title="What's next?"
		description="Here's what we're working on to make Zapstore even better."
	/>

	<!-- Horizontal Scrolling Tasks -->
	<div class="relative w-screen overflow-hidden">
		<!-- Left gradient fade -->
		<div
			class="hidden md:block absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-30 pointer-events-none"
			style="background: linear-gradient(to right, hsl(var(--background)) 0%, hsl(var(--background) / 0.95) 20%, hsl(var(--background) / 0.7) 50%, transparent 100%);"
		></div>

		<!-- Right gradient fade -->
		<div
			class="hidden md:block absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-30 pointer-events-none"
			style="background: linear-gradient(to left, hsl(var(--background)) 0%, hsl(var(--background) / 0.95) 20%, hsl(var(--background) / 0.7) 50%, transparent 100%);"
		></div>

		<!-- Scrolling container -->
		<div
			bind:this={scrollContainer}
			class="flex gap-6 px-4 md:px-32 py-2 overflow-x-auto scrollbar-hide relative z-10"
		>
			{#each sortedTasks as task (task.id)}
				<div class="task-card flex-shrink-0">
					<!-- Top row: TaskBox + Title -->
					<div class="flex items-center gap-3 mb-3">
						<TaskBox state={task.status} size={24} />
						<h3 class="task-title">{task.title}</h3>
					</div>

					<!-- Description -->
					<p class="task-description">{task.description}</p>

					<!-- ETA at bottom -->
					<div class="task-eta">{task.eta}</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.task-card {
		width: 300px;
		min-height: 160px;
		padding: 1.25rem;
		background: hsl(var(--gray44));
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: 1.25rem;
		display: flex;
		flex-direction: column;
	}

	.task-title {
		font-size: 1.0625rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1.3;
	}

	.task-description {
		font-size: 0.875rem;
		color: hsl(var(--white66));
		line-height: 1.6;
		flex: 1;
	}

	.task-eta {
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: hsl(var(--white33));
		margin-top: auto;
		padding-top: 0.75rem;
	}

	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
