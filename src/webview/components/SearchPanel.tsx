import { useEffect, useRef, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from './Icons'

interface SearchPanelProps {
    open: boolean
    containerRef: React.RefObject<HTMLElement | null>
    content: string
    onClose: () => void
}

interface HighlightRegistry {
    set(name: string, highlight: unknown): void
    delete(name: string): void
}

function getHighlightSupport(): { registry: HighlightRegistry; Highlight: new (...ranges: Range[]) => unknown } | null {
    const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
    const Highlight = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    return registry && Highlight ? { registry, Highlight } : null
}

function collectRanges(root: HTMLElement, query: string): Range[] {
    const ranges: Range[] = []
    if (!query) return ranges

    const needle = query.toLocaleLowerCase()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement
            if (!parent) return NodeFilter.FILTER_REJECT
            if (parent.closest('script, style, button, .block-header')) return NodeFilter.FILTER_REJECT
            return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        },
    })

    while (walker.nextNode()) {
        const node = walker.currentNode as Text
        const text = node.nodeValue ?? ''
        // Case-folding can change a string's length (e.g. "İ"); only fold
        // when offsets stay valid for the original text node.
        const folded = text.toLocaleLowerCase()
        const haystack = folded.length === text.length ? folded : text
        let offset = 0
        while (offset <= haystack.length) {
            const index = haystack.indexOf(needle, offset)
            if (index < 0) break
            const range = document.createRange()
            range.setStart(node, index)
            range.setEnd(node, index + query.length)
            ranges.push(range)
            offset = index + Math.max(1, query.length)
        }
    }
    return ranges
}

export default function SearchPanel({ open, containerRef, content, onClose }: SearchPanelProps) {
    const [query, setQuery] = useState('')
    const [current, setCurrent] = useState(0)
    const [total, setTotal] = useState(0)
    const rangesRef = useRef<Range[]>([])
    const inputRef = useRef<HTMLInputElement>(null)

    const applyHighlights = (ranges: Range[], index: number) => {
        const support = getHighlightSupport()
        if (!support) return
        support.registry.delete('mdp-search')
        support.registry.delete('mdp-search-current')

        // Painting is capped for very common terms; the current match is
        // always painted, even past the cap.
        support.registry.set('mdp-search', new support.Highlight(...ranges.slice(0, 500)))
        if (ranges[index]) {
            support.registry.set('mdp-search-current', new support.Highlight(ranges[index]))
        }
    }

    const scrollTo = (ranges: Range[], index: number) => {
        const range = ranges[index]
        if (!range) return
        const element = range.startContainer.parentElement
        element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    useEffect(() => {
        if (!open) {
            const support = getHighlightSupport()
            support?.registry.delete('mdp-search')
            support?.registry.delete('mdp-search-current')
            return
        }
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [open])

    useEffect(() => {
        if (!open) return
        const root = containerRef.current
        if (!root) return

        const timer = setTimeout(() => {
            const ranges = collectRanges(root, query)
            rangesRef.current = ranges
            setTotal(ranges.length)
            setCurrent(0)
            applyHighlights(ranges, 0)
        }, 100)

        return () => clearTimeout(timer)
    }, [open, query, content, containerRef])

    useEffect(() => {
        applyHighlights(rangesRef.current, current)
    }, [current])

    if (!open) return null

    const move = (delta: number) => {
        const ranges = rangesRef.current
        if (ranges.length === 0) return
        const next = (current + delta + ranges.length) % ranges.length
        setCurrent(next)
        scrollTo(ranges, next)
    }

    return (
        <div className="search-panel" role="search">
            <input
                ref={inputRef}
                value={query}
                placeholder="Find in document"
                aria-label="Find in document"
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Enter') {
                        event.preventDefault()
                        move(event.shiftKey ? -1 : 1)
                    } else if (event.key === 'Escape') {
                        event.preventDefault()
                        onClose()
                    }
                }}
            />
            <span className="search-panel__count">
                {query ? `${total === 0 ? 0 : current + 1}/${total}` : ''}
            </span>
            <button type="button" onClick={() => move(-1)} title="Previous match" aria-label="Previous match">
                <ArrowUpIcon size={14} />
            </button>
            <button type="button" onClick={() => move(1)} title="Next match" aria-label="Next match">
                <ArrowDownIcon size={14} />
            </button>
            <button type="button" onClick={onClose} title="Close search" aria-label="Close search">
                <CloseIcon size={14} />
            </button>
        </div>
    )
}
