<!--
  Compact 2×2 stack hint — 28×28px (matches CommentCard / ZapActivityCard emoji badge).
  Border-box 28px, 1px border + 2px pad → 24×24 content; 10+2+10 wide, 10+2+10 tall.
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
		padding: 2px;
		display: grid;
		grid-template-columns: 10px 10px;
		grid-template-rows: 10px 10px;
		gap: 2px;
		background-color: hsl(var(--gray33));
		border: 1px solid hsl(var(--white16));
		border-radius: 10px;
	}

	.stack-mini-tile {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: hsl(var(--blurpleColor66));
		flex-shrink: 0;
	}
</style>
