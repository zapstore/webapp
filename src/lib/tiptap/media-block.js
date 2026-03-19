/**
 * TipTap block-level media node (image/video).
 * Renders on its own line; pending = spinner + 33% opacity.
 * In editor: round gray33 cross button to remove; cursor moves to next line after insert.
 */
import { Node, mergeAttributes } from '@tiptap/core';

function renderMediaBlock(dom, node, editor, getPos) {
    const { url, pending, placeholderUrl, type } = node.attrs;
    const isVideo = type === 'video';
    const src = url || placeholderUrl || '';
    const loading = !!pending;
    dom.className = 'media-block-editor';
    dom.setAttribute('data-media-block', '');
    if (loading) dom.classList.add('media-block-editor-pending');
    dom.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'media-block-editor-inner';
    if (loading) {
        if (src) {
            const preview = document.createElement(isVideo ? 'video' : 'img');
            preview.className = 'media-block-editor-preview';
            preview.src = src;
            if (isVideo) preview.muted = true;
            wrap.appendChild(preview);
        }
        const spinner = document.createElement('div');
        spinner.className = 'media-block-editor-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        spinner.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="47 15" stroke-linecap="round"/></svg>';
        wrap.appendChild(spinner);
    } else if (url) {
        if (isVideo) {
            const video = document.createElement('video');
            video.className = 'media-block-editor-element';
            video.src = url;
            video.controls = true;
            video.preload = 'metadata';
            video.playsInline = true;
            wrap.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.className = 'media-block-editor-element';
            img.src = url;
            img.alt = '';
            img.loading = 'lazy';
            wrap.appendChild(img);
        }
    }
    dom.appendChild(wrap);
    // Remove button (editor only)
    if (editor && typeof getPos === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'media-block-editor-remove';
        btn.setAttribute('aria-label', 'Remove media');
        btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pos = getPos();
            if (pos === undefined) return;
            const { state } = editor;
            const { tr } = state;
            const $pos = state.doc.resolve(pos);
            const node = $pos.nodeAfter;
            if (node)
                editor.view.dispatch(tr.delete(pos, pos + node.nodeSize));
        });
        dom.appendChild(btn);
    }
}

export const MediaBlockExtension = Node.create({
    name: 'mediaBlock',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            id: { default: null },
            url: { default: null },
            pending: { default: true },
            placeholderUrl: { default: null },
            type: { default: 'image' },
        };
    },
    parseHTML() {
        return [{ tag: 'div[data-media-block]' }];
    },
    renderHTML({ node }) {
        return ['div', mergeAttributes(this.options.HTMLAttributes, { 'data-media-block': '' }), 0];
    },
    addNodeView() {
        return ({ node, editor, getPos }) => {
            const dom = document.createElement('div');
            renderMediaBlock(dom, node, editor, getPos);
            return {
                dom,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'mediaBlock') return false;
                    dom.innerHTML = '';
                    renderMediaBlock(dom, updatedNode, editor, getPos);
                    return true;
                },
            };
        };
    },
});
