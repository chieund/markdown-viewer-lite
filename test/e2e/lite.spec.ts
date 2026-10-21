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
    await expect(page.locator('.toc__title')).toHaveText('Lite Preview')
    await expect(page.locator('.toc__item')).toHaveCount(4)
    await expect(page.locator('.toc__number')).toHaveText(['1', '2', '3', '4'])
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
    await page.getByRole('menuitem', { name: 'HTML', exact: true }).click()

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


function postedMessages(page: Page) {
    return page.evaluate(() =>
        (window as unknown as { __postedMessages: Array<{ type: string; [key: string]: unknown }> }).__postedMessages,
    )
}

const ANCHORS = `# Anchors

[Jump to the second setup](#setup-1) and a footnote[^1].

\`\`\`bash
# setup
npm install
\`\`\`

## Setup

First setup.

${Array.from({ length: 40 }, (_, index) => `Filler paragraph ${index}.`).join('\n\n')}

## Setup

Second setup.

${Array.from({ length: 40 }, (_, index) => `More filler ${index}.`).join('\n\n')}

[^1]: The footnote text.
`

test('follows in-page anchors and footnotes inside the preview', async ({ page }) => {
    await openLite(page, ANCHORS)

    await page.getByRole('link', { name: 'Jump to the second setup' }).click()
    await expect(page.locator('#setup-1')).toBeInViewport()
    const afterAnchor = await postedMessages(page)
    expect(afterAnchor.some(message => message.type === 'OPEN_LINK')).toBe(false)
    const secondSetupLine = ANCHORS.split('\n').lastIndexOf('## Setup')
    await expect.poll(async () => (await postedMessages(page))
        .filter(message => message.type === 'REVEAL_LINE').at(-1)?.line).toBe(secondSetupLine)

    const footnoteRef = page.locator('sup a').first()
    const target = await footnoteRef.getAttribute('href')
    await footnoteRef.click()
    await expect(page.getByText('The footnote text.')).toBeInViewport()
    expect(target).toBeTruthy()

    await page.locator('a[data-footnote-backref]').first().click()
    await expect(footnoteRef).toBeInViewport()
})

test('follows VS Code theme changes in auto mode', async ({ page }) => {
    await openLite(page, CONTENT, { ...CONFIG, theme: 'auto' })
    const toggle = page.getByRole('button', { name: 'Toggle light/dark theme' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('html')).toHaveAttribute('data-vscode-colors', '')

    await page.evaluate(() => document.body.classList.add('vscode-dark'))
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    // A manual choice stops borrowing the editor's colours.
    await expect(page.locator('html')).not.toHaveAttribute('data-vscode-colors', '')
})

test('keeps source lines on code blocks and diagrams for scroll sync', async ({ page }) => {
    await openLite(page, CONTENT)
    const lines = CONTENT.split('\n')
    await expect(page.locator('.code-block')).toHaveAttribute('data-line', String(lines.indexOf('```ts') + 1))
    await expect(page.locator('figure.pele-diagram').first()).toHaveAttribute('data-line', String(lines.indexOf('```mermaid') + 1))
})

test('highlights more common languages', async ({ page }) => {
    await openLite(page, [
        '```ruby\ndef hello\n  puts "hi"\nend\n```',
        '```cpp\nint main() { return 0; }\n```',
        '```csharp\npublic class A { }\n```',
        '```php\n<?php echo "hi"; ?>\n```',
    ].join('\n\n'))
    for (const language of ['ruby', 'cpp', 'csharp', 'php']) {
        await expect(page.locator(`code.language-${language} .token`).first()).toBeVisible()
    }
})

test('renders GitHub alerts as callouts', async ({ page }) => {
    await openLite(page, '> [!NOTE]\n> Useful information.\n\n> [!WARNING]\n> Careful **here**.\n\n> Plain quote.\n')
    await expect(page.locator('.markdown-alert')).toHaveCount(2)
    await expect(page.locator('.markdown-alert-note .markdown-alert-title')).toHaveText('Note')
    await expect(page.locator('.markdown-alert-note')).toContainText('Useful information.')
    await expect(page.locator('.markdown-alert-note')).not.toContainText('[!NOTE]')
    await expect(page.locator('.markdown-alert-warning strong')).toHaveText('here')
    await expect(page.locator('blockquote')).toHaveText('Plain quote.')
})

test('copies code and diagram source from block headers', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openLite(page, CONTENT)

    await expect(page.locator('.code-block .block-header__label')).toHaveText('ts')
    await page.getByRole('button', { name: 'Copy code' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('const answer: number = 42\nconsole.log(answer)')

    const diagram = page.locator('.pele-diagram').first()
    await expect(diagram.locator('.block-header__label')).toContainText('flowchart')
    await expect(diagram.locator('.block-header__label')).toContainText('Pele')
    await diagram.getByRole('button', { name: 'Copy Mermaid source' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('flowchart TD')

    await diagram.getByRole('button', { name: 'Download SVG' }).click()
    await expect.poll(async () => (await postedMessages(page)).some(message => message.type === 'EXPORT_SVG')).toBe(true)
})

test('filters the outline and pauses scroll sync', async ({ page }) => {
    await openLite(page, CONTENT)
    await page.getByRole('textbox', { name: 'Filter headings' }).fill('diag')
    await expect(page.locator('.toc__text')).toHaveText(['Diagram', 'Second diagram'])

    await page.getByRole('button', { name: 'Scroll sync' }).click()
    await expect(page.locator('.statusbar__sync')).toHaveText('Scroll sync off')
    await page.evaluate(() => {
        (window as unknown as { __postedMessages: unknown[] }).__postedMessages = []
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'SCROLL_TO_LINE', line: 30 } }))
    })
    await page.waitForTimeout(200)
    expect(await page.locator('.preview-scroll').evaluate(element => element.scrollTop)).toBe(0)
})

test('shows the workspace path as a breadcrumb', async ({ page }) => {
    await openLite(page, CONTENT)
    await page.evaluate(() => window.postMessage({
        type: 'SET_CONTENT', content: '# Hi', fileName: 'handbook.md', relativePath: 'docs/guides/handbook.md',
    }, '*'))
    await expect(page.locator('.breadcrumb__folder')).toHaveText(['docs', 'guides'])
    await expect(page.locator('.breadcrumb__file')).toHaveText('handbook.md')
})
