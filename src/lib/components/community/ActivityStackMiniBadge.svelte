<!--
  Compact 2×2 stack hint — fixed 32×32px (matches CommentCard badge), integer pixel grid.
  Math: border-box 32px, 1px border + 3px pad → 24×24 content; 10+4+10 wide, 10+4+10 tall.
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
		width: 32px;
		height: 32px;
		padding: 3px;
		display: grid;
		grid-template-columns: 10px 10px;
		grid-template-rows: 10px 10px;
		gap: 4px;
		background-color: hsl(var(--gray33));
		border: 1px solid hsl(var(--white16));
		border-radius: 8px;
	}

	.stack-mini-tile {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: hsl(var(--blurpleColor66));
		flex-shrink: 0;
	}
</style>
