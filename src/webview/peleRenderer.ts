import DOMPurify from 'dompurify'
import { render, supports } from 'pele'

export type PeleRenderResult =
    | { ok: true; svg: string; width: number; height: number }
    | { ok: false; error: string; unsupported: boolean }

let diagramCounter = 0

function sanitizeSvg(svg: string): string {
    return DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true, html: true },
        ADD_TAGS: ['foreignObject', 'style'],
        HTML_INTEGRATION_POINTS: { foreignobject: true },
        SANITIZE_NAMED_PROPS: false,
    })
}

/**
 * Pele derives SVG ids from the Mermaid source (`A`, `L_A_B_0`). Two
 * diagrams in one document would therefore contain duplicate ids. Prefix
 * every id — and the attributes pointing at it — per render.
 */
export function namespaceSvgIds(svg: string, prefix: string): string {
    if (typeof DOMParser === 'undefined') return svg

    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement
    if (!root || root.nodeName === 'parsererror') return svg

    const ids = new Map<string, string>()
    root.querySelectorAll('[id]').forEach(element => {
        const oldId = element.getAttribute('id')
        if (!oldId) return
        const newId = `${prefix}-${oldId}`
        ids.set(oldId, newId)
        element.setAttribute('id', newId)
    })
    if (ids.size === 0) return svg

    const referenceAttributes = [
        'href',
        'xlink:href',
        'aria-labelledby',
        'aria-describedby',
        'fill',
        'stroke',
        'filter',
        'clip-path',
        'mask',
        'marker-start',
        'marker-mid',
        'marker-end',
    ]

    root.querySelectorAll('*').forEach(element => {
        for (const attribute of referenceAttributes) {
            const value = element.getAttribute(attribute)
            if (!value) continue

            if (attribute.startsWith('aria-')) {
                element.setAttribute(
                    attribute,
                    value
                        .split(/\s+/)
                        .map(id => ids.get(id) ?? id)
                        .join(' '),
                )
                continue
            }

            if (value.startsWith('#')) {
                element.setAttribute(attribute, `#${ids.get(value.slice(1)) ?? value.slice(1)}`)
                continue
            }

            if (value.includes('url(#')) {
                element.setAttribute(
                    attribute,
                    value.replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${ids.get(id) ?? id})`),
                )
            }
        }
    })

    return new XMLSerializer().serializeToString(root)
}

export function renderMermaidWithPele(chart: string): PeleRenderResult {
    const source = chart.trim()
    if (!source) return { ok: false, error: 'The diagram is empty.', unsupported: false }

    try {
        if (!supports(source)) {
            return {
                ok: false,
                unsupported: true,
                error: 'Pele does not recognise this diagram type. ZenUML and Mermaid plugins are not supported.',
            }
        }

        const result = render(source)
        const prefix = `pele-${++diagramCounter}`
        return {
            ok: true,
            svg: namespaceSvgIds(sanitizeSvg(result.svg), prefix),
            width: result.width,
            height: result.height,
        }
    } catch (error) {
        return {
            ok: false,
            unsupported: false,
            error: error instanceof Error ? error.message : 'Unknown Pele error.',
        }
    }
}
