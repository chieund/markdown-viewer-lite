import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { copyText, saveSvg } from '../clipboard'

interface DiagramLightboxProps {
    svg: string
    chart: string
    onClose: () => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25

function clampZoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 * Full-screen diagram viewer. The preview stays deliberately small; this
 * gives dense flowcharts room to breathe without adding a diagram editor.
 */
export default function DiagramLightbox({ svg, chart, onClose }: DiagramLightboxProps) {
    const [zoom, setZoom] = useState(1)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const [copied, setCopied] = useState(false)

    const stageRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    const copyTimer = useRef<number | undefined>(undefined)
    const dragRef = useRef<{
        pointerId: number
        startX: number
        startY: number
        originX: number
        originY: number
    } | null>(null)

    const zoomAround = useCallback((next: number, centerX = 0, centerY = 0) => {
        const clamped = clampZoom(next)
        const ratio = clamped / zoom
        setOffset(current => ({
            x: centerX - (centerX - current.x) * ratio,
            y: centerY - (centerY - current.y) * ratio,
        }))
        setZoom(clamped)
    }, [zoom])

    const fit = useCallback(() => {
        setZoom(1)
        setOffset({ x: 0, y: 0 })
    }, [])

    // Keep focus inside the dialog and restore it to the diagram button.
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const timer = window.setTimeout(() => closeRef.current?.focus(), 0)

        return () => {
            window.clearTimeout(timer)
            document.body.style.overflow = previousOverflow
            // The browser moves focus to <body> after the focused close button
            // is removed; restore the diagram button on the next task.
            window.setTimeout(() => {
                if (previous && document.contains(previous)) previous.focus()
            }, 0)
        }
    }, [])

    // Native wheel listener: React's synthetic wheel event can be passive, so
    // preventDefault() would not reliably stop the page from scrolling.
    useEffect(() => {
        const stage = stageRef.current
        if (!stage) return

        const handleWheel = (event: WheelEvent) => {
            event.preventDefault()
            const rect = stage.getBoundingClientRect()
            const centerX = event.clientX - rect.left - rect.width / 2
            const centerY = event.clientY - rect.top - rect.height / 2
            zoomAround(zoom * Math.exp(-event.deltaY * 0.0015), centerX, centerY)
        }

        stage.addEventListener('wheel', handleWheel, { passive: false })
        return () => stage.removeEventListener('wheel', handleWheel)
    }, [zoom, zoomAround])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
            }

            if (event.key === '+' || event.key === '=') {
                event.preventDefault()
                zoomAround(zoom * ZOOM_STEP)
                return
            }

            if (event.key === '-') {
                event.preventDefault()
                zoomAround(zoom / ZOOM_STEP)
                return
            }

            if (event.key === '0') {
                event.preventDefault()
                fit()
                return
            }

            if (event.key !== 'Tab' || !panelRef.current) return
            const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            )).filter(element => !element.hasAttribute('disabled'))
            if (focusable.length === 0) return

            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [fit, onClose, zoom, zoomAround])

    useEffect(() => () => {
        if (copyTimer.current) clearTimeout(copyTimer.current)
    }, [])

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: offset.x,
            originY: offset.y,
        }
        setDragging(true)
    }

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        setOffset({
            x: drag.originX + event.clientX - drag.startX,
            y: drag.originY + event.clientY - drag.startY,
        })
    }

    const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        dragRef.current = null
        setDragging(false)
    }

    const downloadSvg = () => saveSvg(svg)

    const copySource = async () => {
        await copyText(chart)
        setCopied(true)
        if (copyTimer.current) clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
    }

    return createPortal(
        <div
            className="diagram-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Diagram preview"
            onClick={event => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                className="diagram-lightbox__panel"
                ref={panelRef}
                onMouseDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
            >
                <header className="diagram-lightbox__toolbar">
                    <div className="diagram-lightbox__heading">
                        <span className="diagram-lightbox__title">Diagram preview</span>
                        <span className="diagram-lightbox__hint">Drag to pan · Scroll to zoom</span>
                    </div>
                    <div className="diagram-lightbox__actions">
                        <button
                            type="button"
                            className="diagram-lightbox__icon"
                            onClick={() => zoomAround(zoom / ZOOM_STEP)}
                            title="Zoom out (-)"
                            aria-label="Zoom out"
                        >
                            −
                        </button>
                        <output className="diagram-lightbox__zoom" aria-live="polite">
                            {Math.round(zoom * 100)}%
                        </output>
                        <button
                            type="button"
                            className="diagram-lightbox__icon"
                            onClick={() => zoomAround(zoom * ZOOM_STEP)}
                            title="Zoom in (+)"
                            aria-label="Zoom in"
                        >
                            +
                        </button>
                        <button type="button" className="button" onClick={fit} title="Fit diagram (0)">
                            Fit
                        </button>
                        <button type="button" className="button" onClick={downloadSvg} title="Download SVG">
                            SVG
                        </button>
                        <button
                            type="button"
                            className="button"
                            onClick={() => void copySource()}
                            title="Copy Mermaid source"
                            aria-label="Copy Mermaid source"
                        >
                            {copied ? 'Copied' : 'Source'}
                        </button>
                        <button
                            ref={closeRef}
                            type="button"
                            className="diagram-lightbox__close"
                            onClick={onClose}
                            title="Close (Esc)"
                            aria-label="Close diagram preview"
                        >
                            ×
                        </button>
                    </div>
                </header>

                <div
                    ref={stageRef}
                    className={`diagram-lightbox__stage${dragging ? ' diagram-lightbox__stage--dragging' : ''}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onDoubleClick={fit}
                >
                    <div
                        className="diagram-lightbox__zoom-layer"
                        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
                    >
                        <div
                            className="diagram-lightbox__svg"
                            // Already sanitised and id-namespaced before it reaches the dialog.
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    )
}
