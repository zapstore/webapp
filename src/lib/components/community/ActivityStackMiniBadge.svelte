<!--
  Compact 2×2 stack hint — 28×28px (matches CommentCard / ZapActivityCard emoji badge).
  Box: 1px border + 3px pad → 20×20 grid area; 9+2+9 tiles (smaller squares, more breathing room than 11px tiles + 1px pad).
-->
<div class="stack-mini-badge" aria-hidden="true">
	<span class="stack-mini-tile"></span>
	<span class="stack-mini-tile"></span>
	<span class="stack-mini-tile"></span>
	<span class="stack-mini-tile"></span>
</div>

<style>
	.stack-mini-badge {
		box-sizing: border-box;
		width: 28px;
		height: 28px;
		padding: 3px;
		display: grid;
		grid-template-columns: 9px 9px;
		grid-template-rows: 9px 9px;
		gap: 2px;
		place-content: center;
		background-color: var(--gray33);
		border: 1px solid var(--white16);
		border-radius: 6px;
	}

	.stack-mini-tile {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		background: var(--blurpleColor66);
		flex-shrink: 0;
	}
</style>
