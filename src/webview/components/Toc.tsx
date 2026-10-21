import { useMemo, useState } from 'react'
import { SearchIcon } from './Icons'

export interface TocHeading {
    level: number
    id: string
    text: string
}

interface TocProps {
    headings: TocHeading[]
    activeId: string
    /** Reading progress through the document, 0–100. */
    progress: number
    onSelect: (heading: TocHeading) => void
}

interface OutlineItem extends TocHeading {
    number: string
    depth: number
}

/**
 * A lone leading H1 is the document title; the rest are numbered as an
 * outline (1, 2, 2.1, …) relative to the shallowest remaining level.
 */
function buildOutline(headings: TocHeading[]): { title?: TocHeading; items: OutlineItem[] } {
    const [first, ...rest] = headings
    const hasTitle = first?.level === 1 && !rest.some(heading => heading.level === 1)
    const body = hasTitle ? rest : headings
    if (body.length === 0) return { title: hasTitle ? first : undefined, items: [] }

    const base = Math.min(...body.map(heading => heading.level))
    const counters: number[] = []
    const items = body.map(heading => {
        const depth = Math.min(heading.level - base, 5)
        counters.length = depth + 1
        for (let index = 0; index < depth; index++) counters[index] ??= 1
        counters[depth] = (counters[depth] ?? 0) + 1
        return { ...heading, depth, number: counters.join('.') }
    })
    return { title: hasTitle ? first : undefined, items }
}

export default function Toc({ headings, activeId, progress, onSelect }: TocProps) {
    const [filter, setFilter] = useState('')
    const { title, items } = useMemo(() => buildOutline(headings), [headings])

    const needle = filter.trim().toLocaleLowerCase()
    const visible = needle ? items.filter(item => item.text.toLocaleLowerCase().includes(needle)) : items
    const percent = Math.round(Math.min(100, Math.max(0, progress)))

    return (
        <aside className="sidebar" aria-label="Table of contents">
            <div className="sidebar__header">
                <span className="sidebar__heading">On this page</span>
                <span className="sidebar__count">{items.length + (title ? 1 : 0)}</span>
            </div>

            <label className="sidebar__filter">
                <SearchIcon size={14} />
                <input
                    value={filter}
                    onChange={event => setFilter(event.target.value)}
                    placeholder="Filter headings"
                    aria-label="Filter headings"
                />
            </label>

            <div className="sidebar__body">
                {title && (
                    <button
                        type="button"
                        className={`toc__title${title.id === activeId ? ' toc__title--active' : ''}`}
                        onClick={() => onSelect(title)}
                        title={title.text}
                    >
                        {title.text}
                    </button>
                )}

                <nav className="toc">
                    {visible.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            className={`toc__item${item.id === activeId ? ' toc__item--active' : ''}`}
                            style={{ paddingLeft: `${14 + item.depth * 14}px` }}
                            onClick={() => onSelect(item)}
                            title={item.text}
                            aria-current={item.id === activeId ? 'location' : undefined}
                        >
                            <span className="toc__number">{item.number}</span>
                            <span className="toc__text">{item.text}</span>
                        </button>
                    ))}
                </nav>

                {headings.length === 0 && <div className="toc__empty">No headings</div>}
                {headings.length > 0 && visible.length === 0 && needle && (
                    <div className="toc__empty">No headings match “{filter}”</div>
                )}
            </div>

            <div className="sidebar__footer">
                <div className="sidebar__progress-label">
                    <span>Reading progress</span>
                    <span className="sidebar__progress-value">{percent}%</span>
                </div>
                <div
                    className="sidebar__progress"
                    role="progressbar"
                    aria-label="Reading progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                >
                    <div className="sidebar__progress-bar" style={{ width: `${percent}%` }} />
                </div>
            </div>
        </aside>
    )
}
