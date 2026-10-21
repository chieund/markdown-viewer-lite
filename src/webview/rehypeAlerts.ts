import type { Element, ElementContent, Root, RootContent } from 'hast'

const ALERTS: Record<string, string> = {
    note: 'Note',
    tip: 'Tip',
    important: 'Important',
    warning: 'Warning',
    caution: 'Caution',
}

const MARKER = /^\s*\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n)?/i

function firstElement(children: ElementContent[]): Element | undefined {
    return children.find((child): child is Element => child.type === 'element')
}

/**
 * Turns GitHub alert blockquotes (`> [!NOTE]`) into callouts, using
 * GitHub's own class names. Runs after rehype-sanitize, so the classes it
 * adds are not stripped; it only rewrites nodes the sanitizer already kept.
 */
export default function rehypeAlerts() {
    return (tree: Root) => {
        const visit = (node: Root | RootContent) => {
            if (node.type === 'element' && node.tagName === 'blockquote') convert(node)
            if ('children' in node) node.children.forEach(visit)
        }
        visit(tree)
    }
}

function convert(blockquote: Element): void {
    const paragraph = firstElement(blockquote.children)
    if (!paragraph || paragraph.tagName !== 'p') return
    const text = paragraph.children[0]
    if (!text || text.type !== 'text') return

    const match = MARKER.exec(text.value)
    if (!match) return
    const kind = match[1].toLowerCase()

    text.value = text.value.slice(match[0].length)
    if (!text.value) paragraph.children.shift()
    // `[!NOTE]` alone on its line leaves a leading <br> or an empty paragraph.
    const next = paragraph.children[0]
    if (next?.type === 'element' && next.tagName === 'br') paragraph.children.shift()
    if (paragraph.children.length === 0) {
        blockquote.children.splice(blockquote.children.indexOf(paragraph), 1)
    }

    blockquote.tagName = 'div'
    blockquote.properties = {
        ...blockquote.properties,
        className: ['markdown-alert', `markdown-alert-${kind}`],
        role: 'note',
    }
    blockquote.children.unshift({
        type: 'element',
        tagName: 'p',
        properties: { className: ['markdown-alert-title'] },
        children: [{ type: 'text', value: ALERTS[kind] }],
    })
}
