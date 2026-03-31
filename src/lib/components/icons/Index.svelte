<script>
	/** Zapstore “indexed” glyph (catalog stack + caret) — default fill matches pill label (--white33). */
	export let size = 14;
	export let className = '';
	/** Set false to rely on parent `color` / `currentColor` instead of --white33 */
	export let useWhite33 = true;
</script>

<svg
	width={Math.round((size * 40) / 65)}
	height={size}
	viewBox="0 0 40 65"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	class={className}
	aria-hidden="true"
>
	<g fill={useWhite33 ? 'hsl(var(--white33))' : 'currentColor'}>
		<path
			d="M28.3741 27C29.8337 27 30.8017 28.5129 30.19 29.8381L25.9231 38.9165C25.2843 40.3005 26.3666 41.8617 27.8868 41.7491L33.7236 41.3168C35.4176 41.1913 36.4869 43.1014 35.4944 44.4799L21.623 63.7457C20.8249 64.8543 19.175 64.8543 18.3769 63.7457L4.50547 44.4799C3.51291 43.1014 4.58222 41.1913 6.27628 41.3168L12.1131 41.7491C13.6332 41.8617 14.7155 40.3005 14.0768 38.9165L9.80983 29.8381C9.19818 28.5129 10.1662 27 11.6257 27H28.3741Z"
		/>
		<path
			d="M6 20.5C6 19.1193 7.11929 18 8.5 18H31.5C32.8807 18 34 19.1193 34 20.5C34 21.8807 32.8807 23 31.5 23H8.5C7.11929 23 6 21.8807 6 20.5Z"
		/>
		<path
			d="M3 11.5C3 10.1193 4.11929 9 5.5 9H34.5C35.8807 9 37 10.1193 37 11.5C37 12.8807 35.8807 14 34.5 14H5.5C4.11929 14 3 12.8807 3 11.5Z"
		/>
		<path
			d="M0 2.5C0 1.11929 1.11929 0 2.5 0H37.5C38.8807 0 40 1.11929 40 2.5C40 3.88071 38.8807 5 37.5 5H2.5C1.11929 5 0 3.88071 0 2.5Z"
		/>
	</g>
</svg>
