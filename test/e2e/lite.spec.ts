import { expect, test, type Page } from '@playwright/test'

const CONTENT = `# Lite Preview

A paragraph with a searchable needle and **bold** text.

## Code

\`\`\`ts
const answer: number = 42
console.log(answer)
\`\`\`

## Diagram

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Ready?}
    B -->|Yes| C[Ship]
\`\`\`

## Second diagram

\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi
\`\`\`

## Table

| Name | Value |
| --- | --- |
| one | 1 |
`

interface LiteConfig {
    fontSize: number
    theme: 'auto' | 'light' | 'dark'
    showToc: boolean
    syntaxHighlighting: boolean
}

const CONFIG: LiteConfig = {
    fontSize: 16,
    theme: 'light',
    showToc: true,
    syntaxHighlighting: true,
}

async function openLite(page: Page, content: string, config: LiteConfig = CONFIG): Promise<void> {
    await page.addInitScript(([initialContent, initialConfig]) => {
        const win = window as unknown as {
            __postedMessages: Array<{ type: string; [key: string]: unknown }>
            acquireVsCodeApi: () => { postMessage: (message: { type: string; [key: string]: unknown }) => void }
        }
        win.__postedMessages = []
        win.acquireVsCodeApi = () => ({
            postMessage: message => {
                win.__postedMessages.push(message)
                if (message?.type === 'READY') {
                    window.postMessage({
                        type: 'SET_CONTENT',
                        content: initialContent,
                        fileName: 'demo.md',
                        config: initialConfig,
                    }, '*')
                }
            },
        })
    }, [content, config] as const)

    await page.goto('/index.html')
    await page.locator('.markdown-body').waitFor({ state: 'attached' })
}

test('renders Markdown, TOC and Pele diagrams without duplicate SVG ids', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(String(error)))
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
    })

    await openLite(page, CONTENT)

    await expect(page.locator('.pele-diagram__canvas svg')).toHaveCount(2)
    await expect(page.locator('.toc__item')).toHaveCount(5)
    await expect(page.locator('.code-block .token.keyword').first()).toBeVisible()

    const duplicateIds = await page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('[id]')).map(element => element.id)
        return ids.filter((id, index) => ids.indexOf(id) !== index)
    })
    expect(duplicateIds).toEqual([])
    expect(errors).toEqual([])
})

test('opens a diagram lightbox with zoom controls and unique ids', async ({ page }) => {
    await openLite(page, CONTENT)

    const expand = page.getByRole('button', { name: 'Open diagram fullscreen' }).first()
    await expand.click()

    const dialog = page.getByRole('dialog', { name: 'Diagram preview' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.diagram-lightbox__svg svg')).toHaveCount(1)
    await expect(dialog.locator('.diagram-lightbox__zoom')).toHaveText('100%')
    await expect(dialog.getByRole('button', { name: 'Close diagram preview' })).toBeFocused()

    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await expect(dialog.locator('.diagram-lightbox__zoom')).toHaveText('125%')
    await dialog.getByRole('button', { name: 'Fit' }).click()
    await expect(dialog.locator('.diagram-lightbox__zoom')).toHaveText('100%')

    await dialog.getByRole('button', { name: 'SVG', exact: true }).click()
    await page.waitForFunction(() => {
        const messages = (window as unknown as {
            __postedMessages: Array<{ type: string; svg?: string }>
        }).__postedMessages
        return messages.some(message => message.type === 'EXPORT_SVG' && message.svg?.includes('<svg'))
    })

    const duplicateIds = await page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('[id]')).map(element => element.id)
        return ids.filter((id, index) => ids.indexOf(id) !== index)
    })
    expect(duplicateIds).toEqual([])

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(expand).toBeFocused()
})

test('search highlights matches and reports the count', async ({ page }) => {
    await openLite(page, CONTENT)

    await page.keyboard.press('Control+f')
    await page.locator('.search-panel input').fill('needle')
    await expect(page.locator('.search-panel__count')).toHaveText('1/1')

    const highlights = await page.evaluate(() => {
        const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
        return registry ? Array.from(registry.keys()) : []
    })
    expect(highlights).toContain('mdp-search')
    expect(highlights).toContain('mdp-search-current')

    await page.keyboard.press('Escape')
    await expect(page.locator('.search-panel')).toHaveCount(0)
})

test('toggles theme and exports standalone HTML', async ({ page }) => {
    await openLite(page, CONTENT)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByRole('button', { name: 'Toggle light/dark theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('button', { name: 'HTML', exact: true }).click()

    await page.waitForFunction(() =>
        (window as unknown as { __postedMessages: Array<{ type: string }> }).__postedMessages
            .some(message => message.type === 'EXPORT_HTML'),
    )

    const exported = await page.evaluate(() => {
        return (window as unknown as { __postedMessages: Array<{ type: string; html?: string }> }).__postedMessages
            .find(message => message.type === 'EXPORT_HTML')
    })

    expect(exported?.html).toContain('<svg')
    expect(exported?.html).toContain('@media print')
    expect(exported?.html).not.toContain('data-line=')

    const exportedPage = await page.context().newPage()
    await exportedPage.setContent(exported!.html!)
    await expect(exportedPage.locator('h1')).toHaveText('Lite Preview')
    await expect(exportedPage.locator('.pele-diagram__canvas svg')).toHaveCount(2)
    expect(await exportedPage.evaluate(() => getComputedStyle(document.body).overflow)).toBe('auto')
    await exportedPage.close()
})

test('scrolls the preview from a source line and reports preview scrolls', async ({ page }) => {
    const long = `${CONTENT}\n\n${Array.from({ length: 80 }, (_, index) => `Paragraph ${index} with filler text.`).join('\n\n')}`
    await openLite(page, long)
    await page.waitForTimeout(250)

    await page.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'SCROLL_TO_LINE', line: 60 } }))
    })
    await expect.poll(() => page.locator('.preview-scroll').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    // Let the "ignore the programmatic scroll" window elapse before testing
    // the preview → editor direction.
    await page.waitForTimeout(250)

    await page.evaluate(() => {
        (window as unknown as { __postedMessages: unknown[] }).__postedMessages = []
    })
    await page.locator('.preview-scroll').evaluate(element => {
        element.scrollTop = element.scrollHeight / 2
    })

    await expect.poll(async () => {
        return page.evaluate(() => {
            return (window as unknown as { __postedMessages: Array<{ type: string; line?: number }> }).__postedMessages
                .find(message => message.type === 'REVEAL_LINE')?.line
        })
    }).toBeGreaterThan(0)
})

test('keeps the Mermaid source when Pele does not support the diagram', async ({ page }) => {
    await openLite(page, `# Unsupported\n\n\`\`\`mermaid\nzenuml\ntitle Demo\nA.method()\n\`\`\`\n`)
    await expect(page.locator('.diagram-error')).toContainText('not supported')
    await page.getByText('Show Mermaid source').click()
    await expect(page.locator('.diagram-error pre')).toContainText('zenuml')
})

test('does not overflow horizontally at narrow widths', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await openLite(page, CONTENT)
    const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Open diagram fullscreen' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Diagram preview' })
    await expect(dialog).toBeVisible()
    const toolbarFits = await dialog.locator('.diagram-lightbox__toolbar').evaluate(element =>
        element.scrollWidth <= element.clientWidth + 1,
    )
    expect(toolbarFits).toBe(true)
})

