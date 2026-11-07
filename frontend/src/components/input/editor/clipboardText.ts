import type {Node as ProseMirrorNode, Slice} from '@tiptap/pm/model'

const LIST_TYPES = ['bulletList', 'orderedList', 'taskList']

function isList(node: ProseMirrorNode): boolean {
	return LIST_TYPES.includes(node.type.name)
}

function inlineText(node: ProseMirrorNode): string {
	if (node.isText) {
		return node.text ?? ''
	}

	if (node.type.name === 'hardBreak') {
		return '\n'
	}

	return node.textContent
}

function serializeBlock(node: ProseMirrorNode, indent: string, lines: string[]): void {
	if (isList(node)) {
		serializeList(node, indent, lines)
		return
	}

	const firstChild = node.firstChild
	if (node.childCount > 0 && firstChild !== null && firstChild.isBlock) {
		// Container blocks (blockquote, table cells, …) put every child block on its own line.
		node.forEach(child => serializeBlock(child, indent, lines))
		return
	}

	// Blocks with inline content (paragraph, heading, code block, …).
	let text = ''
	node.forEach(child => {
		text += inlineText(child)
	})
	for (const line of text.split('\n')) {
		lines.push(indent + line)
	}
}

function serializeList(node: ProseMirrorNode, indent: string, lines: string[]): void {
	node.forEach((item, _offset, index) => {
		let marker = '- '
		if (node.type.name === 'orderedList') {
			marker = `${index + 1}. `
		} else if (node.type.name === 'taskList') {
			marker = item.attrs.checked ? '- [x] ' : '- [ ] '
		}

		const itemIndent = indent + ' '.repeat(marker.length)
		const bodyLines: string[] = []
		item.forEach(child => {
			if (child.isBlock) {
				serializeBlock(child, itemIndent, bodyLines)
			} else {
				bodyLines.push(itemIndent + inlineText(child))
			}
		})

		if (bodyLines.length === 0) {
			lines.push(indent + marker)
			return
		}

		// The first line carries the marker; deeper lines already carry their own indent.
		lines.push(indent + marker + bodyLines[0].slice(itemIndent.length))
		for (let i = 1; i < bodyLines.length; i++) {
			lines.push(bodyLines[i])
		}
	})
}

/**
 * Maps a copied slice to the plain text written to the clipboard, keeping markdown
 * list markers so pasting the text elsewhere (or back into Vikunja) yields the same list.
 */
export function serializeClipboardText(slice: Slice): string {
	const lines: string[] = []
	let inlineLines: string[] | null = null

	const flushInline = () => {
		if (inlineLines === null) {
			return
		}
		lines.push(...inlineLines)
		inlineLines = null
	}

	slice.content.forEach(child => {
		if (child.isBlock) {
			flushInline()
			serializeBlock(child, '', lines)
			return
		}

		// A selection inside a single paragraph yields a slice of bare inline nodes.
		if (inlineLines === null) {
			inlineLines = ['']
		}
		const parts = inlineText(child).split('\n')
		inlineLines[inlineLines.length - 1] += parts[0]
		for (let i = 1; i < parts.length; i++) {
			inlineLines.push(parts[i])
		}
	})
	flushInline()

	return lines.join('\n')
}
