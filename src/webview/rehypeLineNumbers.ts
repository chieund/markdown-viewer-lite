import type { Root, RootContent } from 'hast'

/**
 * Stamps every rendered element with its 1-based Markdown source line so the
 * editor and preview can scroll together without a separate source map.
 *
 * Runs before rehypeRaw: raw HTML nodes are re-parsed later and have no
 * position, so they simply inherit the nearest tagged ancestor.
 */
export default function rehypeLineNumbers() {
    return (tree: Root) => {
        const visit = (node: Root | RootContent) => {
            if (node.type === 'element') {
                const line = node.position?.start?.line
                if (typeof line === 'number') {
                    node.properties = { ...node.properties, 'data-line': line }
                }
            }
            if ('children' in node && Array.isArray(node.children)) {
                node.children.forEach(visit)
            }
        }
        visit(tree)
    }
}
