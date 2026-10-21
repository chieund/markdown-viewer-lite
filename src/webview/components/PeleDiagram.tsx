import { useMemo, useState } from 'react'
import { namespaceSvgIds, renderMermaidWithPele } from '../peleRenderer'
import DiagramLightbox from './DiagramLightbox'

interface PeleDiagramProps {
    chart: string
}

let lightboxCounter = 0

/**
 * Pele renders synchronously; there is no loading state or second engine.
 * Unsupported diagrams (ZenUML, Mermaid plugins) keep their source visible.
 */
export default function PeleDiagram({ chart }: PeleDiagramProps) {
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
            <div className="diagram-error" role="alert">
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
        <figure className="pele-diagram" data-engine="pele">
            <span className="pele-diagram__badge" title="Rendered by Pele">
                Pele
            </span>
            <button
                type="button"
                className="pele-diagram__expand"
                onClick={() => setOpen(true)}
                title="Open diagram fullscreen"
                aria-label="Open diagram fullscreen"
            >
                ⤢
            </button>
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
