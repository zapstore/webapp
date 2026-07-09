<script>
	import { onMount } from 'svelte';
	import LandingSectionTitle from './LandingSectionTitle.svelte';
	import TaskBox from '$lib/components/common/TaskBox.svelte';

	// Roadmap tasks ordered by status (closed → inReview → inProgress → open)
	const tasks = [
		{
			id: 1,
			title: 'Android App 1.0',
			description: 'Stable Android release',
			status: 'closed',
			eta: 'COMPLETED'
		},
		{
			id: 2,
			title: 'App Stacks',
			description: 'Curated app lists',
			status: 'closed',
			eta: 'COMPLETED'
		},
		{
			id: 3,
			title: 'Developer Analytics',
			description: 'Publisher insights',
			status: 'closed',
			eta: 'COMPLETED'
		},
		{
			id: 4,
			title: 'Web App',
			description: 'Social features on web',
			status: 'closed',
			eta: 'COMPLETED'
		},
		{
			id: 5,
			title: 'Decentralize Catalogs',
			description: 'Open catalogs with communities',
			status: 'inProgress',
			eta: 'NEXT MONTH'
		},
		{
			id: 6,
			title: 'Mobile Revamp',
			description: 'Social, onboarding, theming',
			status: 'inReview',
			eta: 'NEXT QUARTER'
		},
		{
			id: 7,
			title: 'PWAs',
			description: 'Installable web apps',
			status: 'open',
			eta: 'Q3 2026'
		},
		{
			id: 8,
			title: 'iOS App',
			description: 'Full iOS release',
			status: 'open',
			eta: 'Q3 2026'
		}
	];
	/** @typedef {'closed'|'inReview'|'inProgress'|'open'} TaskStatus */

	// Sort tasks: closed first (partially visible), then inReview, inProgress, open
	/** @type {Record<TaskStatus, number>} */
	const statusOrder = { closed: 0, inReview: 1, inProgress: 2, open: 3 };
	const sortedTasks = [...tasks].sort(
		(a, b) =>
			statusOrder[/** @type {TaskStatus} */ (a.status)] -
			statusOrder[/** @type {TaskStatus} */ (b.status)]
	);

	/** @type {HTMLDivElement | null} */
	let scrollContainer = null;

	/** @param {HTMLElement | null} container */
	function setInitialScrollPosition(container) {
		if (!container) return;

		const isMobile = window.matchMedia('(max-width: 767px)').matches;
		const headerTitle = container.closest('section')?.querySelector('.section-title');
		const cards = container.querySelectorAll('.task-card');

		let targetIndex = sortedTasks.findIndex((t) => t.status === 'inProgress');
		if (targetIndex === -1) targetIndex = sortedTasks.findIndex((t) => t.status !== 'closed');
		const targetCard = cards[targetIndex];
		if (!headerTitle || !targetCard) return;

		if (isMobile) {
			const alignDelta =
				/** @type {HTMLElement} */ (targetCard).getBoundingClientRect().left -
				headerTitle.getBoundingClientRect().left;
			container.scrollLeft = Math.max(0, container.scrollLeft + alignDelta);
			return;
		}

		// Desktop: peek the last completed card on the left
		const closedTasks = sortedTasks.filter((t) => t.status === 'closed').length;
		if (closedTasks > 0) {
			const cardWidth = 300;
			const gap = 24;
			container.scrollLeft = Math.max(0, (closedTasks - 1) * (cardWidth + gap) + cardWidth - 80);
		}
	}

	onMount(() => {
		if (!scrollContainer) return;

		const run = () => setInitialScrollPosition(scrollContainer);
		requestAnimationFrame(() => requestAnimationFrame(run));
	});
</script>

<section class="border-t border-shell py-8 sm:py-12 lg:py-16">
	<LandingSectionTitle
		title="What's next?"
		description="Here's what we're working on<span class='hidden sm:inline'> to make Zapstore even better.</span>"
	/>

	<!-- Horizontal Scrolling Tasks -->
	<div class="relative w-screen overflow-hidden">
		<!-- Left gradient fade -->
		<div
			class="hidden md:block absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-30 pointer-events-none"
			style="background: linear-gradient(to right, var(--black) 0%, color-mix(in srgb, var(--black) 95%, transparent) 20%, color-mix(in srgb, var(--black) 70%, transparent) 50%, transparent 100%);"
		></div>

		<!-- Right gradient fade -->
		<div
			class="hidden md:block absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-30 pointer-events-none"
			style="background: linear-gradient(to left, var(--black) 0%, color-mix(in srgb, var(--black) 95%, transparent) 20%, color-mix(in srgb, var(--black) 70%, transparent) 50%, transparent 100%);"
		></div>

		<!-- Scrolling container -->
		<div
			bind:this={scrollContainer}
			class="flex gap-6 px-6 md:px-32 py-2 overflow-x-auto scrollbar-hide relative z-10"
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
		width: 262px;
		min-height: 160px;
		padding: 1rem 1.25rem 0.9rem;
		background: var(--gray44);
		border: 1px solid color-mix(in srgb, var(--white16) 40%, transparent);
		border-radius: 1.25rem;
		display: flex;
		flex-direction: column;
	}
	@media (min-width: 640px) {
		.task-card {
			width: 300px;
			padding: 1.25rem;
		}
	}

	.task-card > :global(.flex.mb-3) {
		margin-bottom: 0.4rem;
	}
	@media (min-width: 640px) {
		.task-card > :global(.flex.mb-3) {
			margin-bottom: 0.75rem;
		}
	}

	.task-title {
		font-size: 1.0625rem;
		font-weight: 600;
		color: var(--white);
		line-height: 1.3;
	}

	.task-description {
		font-size: 0.875rem;
		color: var(--white66);
		line-height: 1.6;
		flex: 1;
	}

	.task-eta {
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--white33);
		margin-top: auto;
		padding-top: 0.35rem;
	}
	@media (min-width: 640px) {
		.task-eta {
			padding-top: 0.75rem;
		}
	}

	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
