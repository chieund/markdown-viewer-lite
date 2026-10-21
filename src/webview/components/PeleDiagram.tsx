import { useMemo, useState } from 'react'
import { namespaceSvgIds, renderMermaidWithPele } from '../peleRenderer'
import { saveSvg } from '../clipboard'
import CopyButton from './CopyButton'
import DiagramLightbox from './DiagramLightbox'
import { DownloadIcon, ExpandIcon } from './Icons'

interface PeleDiagramProps {
    chart: string
    /** 1-based Markdown source line of the fence, for scroll sync. */
    line?: number
}

let lightboxCounter = 0

const DIAGRAM_LABELS: Record<string, string> = {
    flowchart: 'flowchart',
    graph: 'flowchart',
    sequencediagram: 'sequence',
    classdiagram: 'class diagram',
    statediagram: 'state diagram',
    'statediagram-v2': 'state diagram',
    erdiagram: 'ER diagram',
    gantt: 'gantt',
    pie: 'pie chart',
    journey: 'user journey',
    mindmap: 'mindmap',
    timeline: 'timeline',
    gitgraph: 'git graph',
}

/** The Mermaid diagram keyword, skipping front matter, directives and comments. */
function diagramLabel(chart: string): string {
    let inFrontMatter = false
    for (const raw of chart.split(/\r?\n/)) {
        const line = raw.trim()
        if (line === '---') {
            inFrontMatter = !inFrontMatter
            continue
        }
        if (inFrontMatter || !line || line.startsWith('%%')) continue
        const keyword = line.split(/\s+/)[0].toLowerCase()
        return DIAGRAM_LABELS[keyword] ?? 'diagram'
    }
    return 'diagram'
}

/**
 * Pele renders synchronously; there is no loading state or second engine.
 * Unsupported diagrams (ZenUML, Mermaid plugins) keep their source visible.
 */
export default function PeleDiagram({ chart, line }: PeleDiagramProps) {
    const result = useMemo(() => renderMermaidWithPele(chart), [chart])
    const [open, setOpen] = useState(false)

    // The preview and the dialog are both in the document while the dialog is
    // open. Namespace the dialog copy separately so SVG ids stay unique.
    const lightboxSvg = useMemo(() => {
        if (!result.ok || !open) return ''
        return namespaceSvgIds(result.svg, `pele-lightbox-${++lightboxCounter}`)
    }, [open, result])

    if (!result.ok) {
        return (
            <div className="diagram-error" role="alert" data-line={line}>
                <div className="diagram-error__title">
                    {result.unsupported ? 'Diagram not supported by Pele' : 'Diagram error'}
                </div>
                <div className="diagram-error__message">{result.error}</div>
                <details>
                    <summary>Show Mermaid source</summary>
                    <pre>{chart}</pre>
                </details>
            </div>
        )
    }

    return (
        <figure className="pele-diagram" data-engine="pele" data-line={line}>
            <div className="block-header">
                <span className="block-header__label">
                    {diagramLabel(chart)}
                    <span className="block-header__engine" title="Rendered by Pele"> · Pele</span>
                </span>
                <div className="block-header__actions">
                    <CopyButton text={chart} label="Source" ariaLabel="Copy Mermaid source" />
                    <button
                        type="button"
                        className="block-action"
                        onClick={() => saveSvg(result.svg)}
                        title="Download SVG"
                        aria-label="Download SVG"
                    >
                        <DownloadIcon size={13} />
                        <span>SVG</span>
                    </button>
                    <button
                        type="button"
                        className="block-action block-action--icon"
                        onClick={() => setOpen(true)}
                        title="Open diagram fullscreen"
                        aria-label="Open diagram fullscreen"
                    >
                        <ExpandIcon size={13} />
                    </button>
                </div>
            </div>
            <div
                className="pele-diagram__canvas"
                // Sanitised and id-namespaced in renderMermaidWithPele().
                dangerouslySetInnerHTML={{ __html: result.svg }}
            />

            {open && (
                <DiagramLightbox
                    svg={lightboxSvg}
                    chart={chart}
                    onClose={() => setOpen(false)}
                />
            )}
        </figure>
    )
}
