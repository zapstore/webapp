/**
 * TipTap block-level Nostr reference node (e.g. app naddr).
 * Renders as a compact card (app pic + name); in editor: Cross button outside top-right to remove.
 * Optional name/iconUrl attrs for immediate display; otherwise resolves from naddr async.
 * Serializes to content as a line "nostr:naddr...".
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { queryEvent } from '$lib/nostr/dexie';
import { decodeNaddr, parseApp } from '$lib/nostr/models';
import { EVENT_KINDS } from '$lib/config';

const CROSS_SVG =
	'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

function setInnerContent(inner, iconUrl, name) {
	const displayName = name || 'App';
	inner.innerHTML = '';
	inner.setAttribute('data-kind', 'app');

	const pic = document.createElement('div');
	pic.className = 'nostr-ref-block-editor-pic';
	if (iconUrl) {
		const img = document.createElement('img');
		img.src = iconUrl;
		img.alt = '';
		img.loading = 'lazy';
		pic.appendChild(img);
	} else {
		const initial = document.createElement('span');
		initial.className = 'nostr-ref-block-editor-initial';
		initial.textContent = displayName.trim()[0]?.toUpperCase() ?? '?';
		pic.appendChild(initial);
	}
	inner.appendChild(pic);

	const nameSpan = document.createElement('span');
	nameSpan.className = 'nostr-ref-block-editor-name';
	nameSpan.textContent = displayName;
	inner.appendChild(nameSpan);
}

function renderNostrRefBlock(dom, node, editor, getPos) {
	const naddr = node.attrs.naddr ?? '';
	const name = node.attrs.name ?? null;
	const iconUrl = node.attrs.iconUrl ?? null;

	dom.className = 'nostr-ref-block-editor';
	dom.setAttribute('data-nostr-ref-block', '');
	dom.innerHTML = '';

	const inner = document.createElement('div');
	inner.className = 'nostr-ref-block-editor-inner';
	setInnerContent(inner, iconUrl, name);
	dom.appendChild(inner);

	if (naddr && !name && typeof window !== 'undefined') {
		const pointer = decodeNaddr(naddr);
		if (pointer && pointer.kind === EVENT_KINDS.APP) {
			queryEvent({
				kinds: [EVENT_KINDS.APP],
				authors: [pointer.pubkey],
				'#d': [pointer.identifier]
			}).then((event) => {
				if (!event || !inner.isConnected) return;
				const app = parseApp(event);
				setInnerContent(inner, app.icon, app.name);
			});
		}
	}

	if (editor && typeof getPos === 'function') {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'nostr-ref-block-editor-remove';
		btn.setAttribute('aria-label', 'Remove reference');
		btn.innerHTML = CROSS_SVG;
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const pos = getPos();
			if (pos === undefined) return;
			const { state } = editor;
			const { tr } = state;
			const $pos = state.doc.resolve(pos);
			const next = $pos.nodeAfter;
			if (next) editor.view.dispatch(tr.delete(pos, pos + next.nodeSize));
		});
		dom.appendChild(btn);
	}
}

export const NostrRefBlockExtension = Node.create({
	name: 'nostrRefBlock',
	group: 'block',
	atom: true,
	addAttributes() {
		return {
			naddr: { default: null },
			name: { default: null },
			iconUrl: { default: null }
		};
	},
	parseHTML() {
		return [{ tag: 'div[data-nostr-ref-block]' }];
	},
	renderHTML({ node }) {
		return [
			'div',
			mergeAttributes(this.options.HTMLAttributes, { 'data-nostr-ref-block': '' }),
			0,
		];
	},
	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement('div');
			renderNostrRefBlock(dom, node, editor, getPos);
			return {
				dom,
				update(updatedNode) {
					if (updatedNode.type.name !== 'nostrRefBlock') return false;
					dom.innerHTML = '';
					renderNostrRefBlock(dom, updatedNode, editor, getPos);
					return true;
				},
			};
		};
	},
});
