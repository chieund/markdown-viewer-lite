import { hasVsCodeApi, post } from './vscode'

export async function copyText(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        // Webviews can deny the async clipboard; fall back to execCommand.
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
    }
}

/** Saves an SVG through VS Code's save dialog, or as a download in a browser. */
export function saveSvg(svg: string, name = 'diagram'): void {
    if (hasVsCodeApi()) {
        post({ type: 'EXPORT_SVG', svg, suggestedName: name })
        return
    }

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${name}.svg`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
