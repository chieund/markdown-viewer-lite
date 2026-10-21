export interface TocHeading {
    level: number
    id: string
    text: string
}

interface TocProps {
    headings: TocHeading[]
    activeId: string
    onSelect: (heading: TocHeading) => void
}

export default function Toc({ headings, activeId, onSelect }: TocProps) {
    return (
        <aside className="sidebar" aria-label="Table of contents">
            <div className="sidebar__header">Contents</div>
            <nav className="toc">
                {headings.length === 0 && <div className="toc__empty">No headings</div>}
                {headings.map(heading => (
                    <button
                        key={`${heading.id}-${heading.level}`}
                        type="button"
                        className={`toc__item${heading.id === activeId ? ' toc__item--active' : ''}`}
                        style={{ paddingLeft: `${12 + (heading.level - 1) * 14}px` }}
                        onClick={() => onSelect(heading)}
                        title={heading.text}
                    >
                        {heading.text}
                    </button>
                ))}
            </nav>
        </aside>
    )
}
