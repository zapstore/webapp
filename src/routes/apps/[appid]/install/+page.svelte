<script>
	import { onMount } from 'svelte';
	import { assets } from '$app/paths';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	export let data;

	$: app = data?.app;
	$: appName = app?.name ?? 'App';
	$: primaryColor = app?.primaryColor ?? '#00000';
	$: appLogoSrc = app?.icon;
	$: showDownloadModal = false;

	const zapstoreDownloadUrl = 'https://zapstore.dev';
	$: appDownloadUrl = app?.dTag
		? `https://zapstore.dev/apps/${app?.dTag}`
		: `https://zapstore.dev/apps?q=${app?.name}`;

	$: darkPrimaryColor = primaryColor + '22';
	$: stepBgColor = (() => {
		const hex = primaryColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		return `rgb(${Math.min(r + 80, 255)}, ${Math.min(g + 80, 255)}, ${Math.min(b + 80, 255)})`;
	})();

	onMount(async () => {
		if (appLogoSrc) {
			primaryColor = await getDominantColor(appLogoSrc);
		}
	});

	function getDominantColor(imgSrc) {
		return new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = 'Anonymous';
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.width;
				canvas.height = img.height;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(img, 0, 0);

				const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

				let r = 0,
					g = 0,
					b = 0,
					count = 0;
				for (let i = 0; i < data.length; i += 4) {
					// Skip transparent/near-white/near-black pixels
					if (data[i + 3] < 128) continue;
					if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue;
					if (data[i] < 15 && data[i + 1] < 15 && data[i + 2] < 15) continue;
					r += data[i];
					g += data[i + 1];
					b += data[i + 2];
					count++;
				}

				if (count === 0) return resolve('#1d91f0');

				r = Math.round(r / count);
				g = Math.round(g / count);
				b = Math.round(b / count);

				resolve(`#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
			};
			img.onerror = () => resolve('#1d91f0');
			img.src = imgSrc;
		});
	}
</script>

<DownloadModal bind:open={showDownloadModal} isZapstore={true} />

<div
	class="install-guide"
	style="--primary: {primaryColor}; --primary-dark: {darkPrimaryColor}; --step-bg: {stepBgColor};"
>
	<main>
		<div class="hero-logo">
			<img alt="{appName} Logo" src={appLogoSrc} />
		</div>

		<div class="headline">
			<h1>How to install<br />{appName}</h1>
			<p>Follow the prompts to continue</p>
		</div>

		<div class="video-card">
			<div class="video-thumb">
				<img
					alt="Video"
					src="https://lh3.googleusercontent.com/aida-public/AB6AXuBt0vbcseJb7U6Oo9Tj-uFbn0Fu7MdCpxiTMcEXjtwf-bS53yjvvy6qcu6O-6Zs8-ljf_Kyo9Du7tVp9FgmsfrkOEZglbwA62T1F6Lrm4t7IUCpMj63tcdrs66ZGWMWMjaTLFN-JymZuFmXOOv1v9b_lG8Cxbe6_BETZ0TUjJpgaBk668cm8WOYmtlpiSRt3AOV8ycrsoLDaiyPwHSQwOUuY6WdVNETGg4OW7PEnbVRK3fFX4uxS13jppTUsUc4YPDfNYMmcXGgDA"
				/>

				<div class="play-overlay">
					<img
						style="width: 2em; height: 2em"
						src={`${assets}/images/install-guide/video_play.svg`}
						alt=""
						srcset=""
					/>
				</div>
			</div>
			<p>Learn more about how to install {appName} via zapstore</p>
		</div>

		<!-- Section 1: Zapstore -->
		<section>
			<div class="section-header">
				<img src={`${assets}/images/logo-dark.svg`} alt="zapstore logo" class="section-icon" />
				<h2>First Download &amp; Install Zapstore</h2>
			</div>

			<div class="step-card">
				<div class="step">
					<div class="step-header">
						<div class="step-number">1</div>
						<div>
							<h3>Download Zapstore &amp; select Download anyway</h3>
							<p class="step-desc">
								Download Zapstore for your device from their website via the link below.
							</p>
						</div>
					</div>
					<img alt="Download Prompt" src={`${assets}/images/install-guide/download_file.svg`} />
				</div>

				<div class="step">
					<div class="step-header">
						<div class="step-number">2</div>
						<div><h3>Open the downloaded file</h3></div>
					</div>
					<img
						alt="Open Downloaded File"
						src={`${assets}/images/install-guide/open_downloaded_file.svg`}
					/>
				</div>

				<div class="step">
					<div class="step-header">
						<div class="step-number">3</div>
						<div><h3>Enable installing Unknown Apps via Browser</h3></div>
					</div>
					<img
						alt="Allow from Chrome"
						src={`${assets}/images/install-guide/allow_from_chrome.svg`}
					/>
				</div>

				<div class="step">
					<div class="step-header">
						<div class="step-number">4</div>
						<div><h3>Install &amp; open Zapstore</h3></div>
					</div>
					<img alt="Install Zapstore" src={`${assets}/images/install-guide/install_zapstore.svg`} />
				</div>
			</div>


			<button class="btn-primary" on:click={() => (showDownloadModal = true)}
				>Download Zapstore</button
			>
		</section>

		<!-- Section 2: App -->
		<section>
			<div class="section-header">
				<img src={`${assets}/images/logo-dark.svg`} alt="zapstore logo" class="section-icon" />
				<h2>Next, Download &amp; Install {appName}</h2>
			</div>

			<div class="step-card">
				<div class="step">
					<div class="step-header">
						<div class="step-number">1</div>
						<div>
							<h3>Search for &amp; install {appName} via Zapstore</h3>
							<p class="step-desc">When prompted, click Trust and install app.</p>
						</div>
					</div>

					<div class="inner-dialog p-4">
						<h4 class="text-xs font-bold text-gray-400 mb-3">Trust this app?</h4>
						<div class="mb-3">
							<p class="text-[10px] text-gray-400">{appName} is published by</p>
							<div class="flex items-center gap-1">
								<div class="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
									<img
										alt="{appName} Logo"
										src={appLogoSrc}
										class="w-3 h-3 rounded-full object-cover"
									/>
								</div>
								<span class="text-[10px] font-bold text-gray-500">{appName}</span>
							</div>
						</div>
						<div class="flex items-center gap-1 mb-4">
							<span class="material-symbols-outlined text-[12px] text-blue-400">-></span>
							<span class="text-[10px] text-[#1d91f0]"
								>Sign in to view the publisher's reputable followers</span
							>
						</div>
						<div class="flex items-center gap-3 mb-6">
							<div class="w-9 h-5 bg-gray-300 rounded-full relative">
								<div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full"></div>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-[10px] text-gray-500">Always trust</span>
								<div class="flex items-center gap-1">
									<div class="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
										<img
											alt="{appName} Logo"
											src={appLogoSrc}
											class="w-3 h-3 rounded-full object-cover"
										/>
									</div>
									<span class="text-[10px] font-bold text-gray-500">{appName}</span>
								</div>
							</div>
						</div>
						<div class="flex items-center gap-4">
							<button class="flex-1 text-[11px] font-bold text-gray-400">Cancel</button>
							<button class="flex-[2] bg-[#1d91f0] text-white py-2 rounded-md text-[11px] font-bold"
								>Trust and install app</button
							>
						</div>
					</div>
				</div>

				<div class="step">
					<div class="step-header">
						<div class="step-number">3</div>
						<div><h3>Enable installing Unknown Apps via Zapstore</h3></div>
					</div>
					<img
						alt="Allow Zapstore"
						src={`${assets}/images/install-guide/allow_from_zapstore.svg`}
					/>
				</div>

				<div class="step">
					<div class="step-header">
						<div class="step-number">4</div>
						<div><h3>Install &amp; open {appName}</h3></div>
					</div>
					<div class="inner-dialog p-4">
						<div class="flex items-center gap-3 mb-3">
							<div class="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center">
								<img
									alt="{appName} Logo"
									src={appLogoSrc}
									class="w-8 h-8 rounded-full object-cover"
								/>
							</div>
							<span class="text-xs font-bold text-gray-700">{appName}</span>
						</div>
						<p class="text-[11px] text-gray-500 mb-6">Do you want to install this app?</p>
						<div class="flex justify-end gap-6 text-[11px] font-bold text-[#1d91f0]">
							<button>Cancel</button>
							<button>Install</button>
						</div>
					</div>
				</div>
			</div>

			<a href={appDownloadUrl} target="_blank" rel="noopener noreferrer">
				<button class="btn-primary">Download {appName}</button>
			</a>
		</section>
	</main>
</div>

<style>
	.install-guide {
		background: radial-gradient(circle at 50% 150px, var(--primary) 0%, #121212 15%);
		background-color: #121212;
		min-height: 100vh;
		font-family: 'Inter', sans-serif;
		color: #aeaeae;
		-webkit-font-smoothing: antialiased;
	}

	main {
		max-width: 450px;
		margin: 0 auto;
		padding: 3rem 1.25rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.hero-logo {
		margin-bottom: 2rem;
		width: 8rem;
		height: 8rem;
		border-radius: 1.5rem;
		overflow: hidden;
		box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
	}

	.hero-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.headline {
		text-align: center;
		margin-bottom: 2.5rem;
		color: #ffffff;
	}

	.headline h1 {
		font-size: 28px;
		font-weight: 700;
		line-height: 1.2;
		margin: 0 0 0.5rem;
	}

	.headline p {
		font-size: 1.25rem;
		margin: 0;
	}

	.video-card {
		width: 100%;
		background-color: var(--primary);
		border-radius: 1rem;
		padding: 0.75rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.video-thumb {
		position: relative;
		width: 6rem;
		height: 3.5rem;
		border-radius: 0.5rem;
		overflow: hidden;
		flex-shrink: 0;
	}

	.video-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.8;
	}

	.play-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.video-card p {
		color: white;
		font-size: 0.75rem;
		line-height: 1.4;
		margin: 0;
	}

	section {
		width: 100%;
		margin-bottom: 3rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.section-header h2 {
		font-weight: 700;
		font-size: 1rem;
		margin: 0;
	}

	.section-icon {
		width: 1.25rem;
		height: 1.25rem;
	}

	.step-card {
		border: 1.5px solid var(--primary-dark);
		background: #252525;
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
		border-radius: 1rem;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.step-header {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.step-number {
		background-color: var(--step-bg);
		color: #252525;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.step h3 {
		font-weight: 700;
		font-size: 0.875rem;
		margin: 0 0 0.25rem;
	}

	.step-desc {
		font-size: 0.75rem;
		color: #666;
		margin: 0;
	}

	.step img {
		width: 100%;
		border-radius: 0.5rem;
	}

	.btn-primary {
		background-color: var(--primary);
		font-weight: 600;
		padding: 1rem;
		width: 100%;
		text-align: center;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		margin-top: 1.5rem;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	a {
		display: block;
		text-decoration: none;
	}

	.inner-dialog {
		background: #f0f0f0;
		border-radius: 1rem;
	}
</style>
