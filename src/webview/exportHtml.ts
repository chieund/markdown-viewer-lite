import appCss from './styles.css?raw'

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

async function inlineImages(root: HTMLElement): Promise<void> {
    const images = Array.from(root.querySelectorAll('img'))
    await Promise.all(images.map(async image => {
        const src = image.getAttribute('src')
        if (!src || src.startsWith('data:')) return
        try {
            const response = await fetch(src)
            if (!response.ok) return
            const blob = await response.blob()
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(String(reader.result))
                reader.onerror = () => reject(reader.error)
                reader.readAsDataURL(blob)
            })
            image.setAttribute('src', dataUrl)
        } catch {
            // Leave the original URL: an exported file with a broken image is
            // better than one with no image element at all.
        }
    }))
}

export interface ExportOptions {
    title: string
    theme: 'light' | 'dark'
}

/** Builds a standalone HTML file from the rendered article. */
export async function buildExportHtml(source: HTMLElement, options: ExportOptions): Promise<string> {
    const clone = source.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-line]').forEach(element => element.removeAttribute('data-line'))
    clone.querySelectorAll('.pele-diagram__badge, button').forEach(element => element.remove())

    await inlineImages(clone)

    return `<!DOCTYPE html>
<html lang="en" data-theme="${options.theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(options.title)}</title>
<style>${appCss}</style>
<style>
    html, body { margin: 0; padding: 0; height: auto; overflow: auto; background: var(--bg); color: var(--fg); }
    body { font-family: var(--font-sans); }
    .export-body { max-width: 900px; margin: 0 auto; padding: 40px 48px; }
    .export-body .markdown-body { padding: 0; max-width: none; }
    @media print {
        :root, [data-theme="dark"] {
            --bg: #ffffff;
            --fg: #111111;
            --muted: #555555;
            --border: #dddddd;
            --border-strong: #888888;
            --surface: #f6f6f6;
            --surface-2: #eeeeee;
            --accent: #0969da;
            --code-bg: #f6f8fa;
        }
        @page { size: A4; margin: 18mm; }
        html, body { background: #fff !important; color: #111 !important; }
        .export-body { max-width: none; padding: 0; }
        .export-body a { color: inherit; text-decoration: underline; }
        .pele-diagram, pre, table, blockquote { break-inside: avoid; }
        .pele-diagram { box-shadow: none; }
    }
</style>
</head>
<body>
<main class="export-body">${clone.outerHTML}</main>
</body>
</html>`
}
