import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MarkdownPreview from './components/MarkdownPreview'
import SearchPanel from './components/SearchPanel'
import Toc, { type TocHeading } from './components/Toc'
import {
    ChevronDownIcon,
    ChevronRightIcon,
    DownloadIcon,
    MoonIcon,
    SearchIcon,
    SidebarIcon,
    SunIcon,
    SyncIcon,
} from './components/Icons'
import { buildExportHtml } from './exportHtml'
import { post } from './vscode'

type ThemeSetting = 'auto' | 'light' | 'dark'
type Theme = 'light' | 'dark'

interface WebviewConfig {
    fontSize: number
    theme: ThemeSetting
    showToc: boolean
    syntaxHighlighting: boolean
}

const DEFAULT_CONFIG: WebviewConfig = {
    fontSize: 16,
    theme: 'auto',
    showToc: true,
    syntaxHighlighting: true,
}

const NARROW_VIEWPORT = 720

function tocFits(): boolean {
    return window.innerWidth > NARROW_VIEWPORT
}

interface SetContentMessage {
    type: 'SET_CONTENT'
    content: string
    url?: string
    fileName?: string
    /** Workspace-relative path, shown as a breadcrumb. */
    relativePath?: string
    config?: WebviewConfig
}

interface ConfigChangedMessage {
    type: 'CONFIG_CHANGED'
    config: WebviewConfig
}

interface ScrollToLineMessage {
    type: 'SCROLL_TO_LINE'
    line: number
}

type HostMessage = SetContentMessage | ConfigChangedMessage | ScrollToLineMessage

function detectTheme(setting: ThemeSetting): Theme {
    if (setting !== 'auto') return setting
    const classes = document.body.classList
    if (classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light')) return 'light'
    if (classes.contains('vscode-dark') || classes.contains('vscode-high-contrast')) return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function findAnchorTarget(root: HTMLElement, href: string): HTMLElement | null {
    let id = href.slice(1)
    try {
        id = decodeURIComponent(id)
    } catch {
        // Malformed percent escapes: fall back to the literal anchor.
    }
    if (!id) return null
    // rehype-sanitize prefixes ids from raw HTML and footnotes with
    // `user-content-`, while links keep the author's spelling (as on GitHub).
    for (const candidate of [id, `user-content-${id}`]) {
        const element = document.getElementById(candidate)
        if (element && root.contains(element)) return element
    }
    return null
}

function countWords(text: string): number {
    return text.trim().match(/\S+/g)?.length ?? 0
}

const WORDS_PER_MINUTE = 220

function breadcrumb(relativePath: string | undefined, fileName: string): string[] {
    const parts = (relativePath ?? fileName).split(/[\\/]/).filter(Boolean)
    if (parts.length === 0) return [fileName]
    // Keep the bar short for deep or absolute paths: the last two folders.
    return parts.length > 3 ? ['…', ...parts.slice(-3)] : parts
}

function baseName(name: string): string {
    return name.replace(/\.[^.]+$/, '')
}

export default function App() {
    const [content, setContent] = useState('')
    const [contentUrl, setContentUrl] = useState<string | undefined>()
    const [fileName, setFileName] = useState('Markdown')
    const [relativePath, setRelativePath] = useState<string | undefined>()
    const [syncEnabled, setSyncEnabled] = useState(true)
    const [progress, setProgress] = useState(0)
    const [config, setConfig] = useState<WebviewConfig>(DEFAULT_CONFIG)
    const [themeOverride, setThemeOverride] = useState<Theme | null>(null)
    const [detectedTheme, setDetectedTheme] = useState<Theme>(() => detectTheme('auto'))
    const [sidebarOpen, setSidebarOpen] = useState(DEFAULT_CONFIG.showToc && tocFits())
    const [searchOpen, setSearchOpen] = useState(false)
    const [exportOpen, setExportOpen] = useState(false)
    const [headings, setHeadings] = useState<TocHeading[]>([])
    const [activeHeading, setActiveHeading] = useState('')
    const [scrollTarget, setScrollTarget] = useState<{ line: number; id: number } | null>(null)
    const [dragging, setDragging] = useState(false)
    const [droppedFile, setDroppedFile] = useState(false)

    const scrollRef = useRef<HTMLDivElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const suppressScrollReport = useRef(false)
    const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const scrollTargetId = useRef(0)
    const droppedRef = useRef(false)
    const initializedRef = useRef(false)
    const themeSettingRef = useRef<ThemeSetting>(DEFAULT_CONFIG.theme)
    const headingsRef = useRef<TocHeading[]>([])
    const syncRef = useRef(true)
    const progressFrame = useRef(0)

    const resolvedTheme: Theme = themeOverride ?? (config.theme === 'auto' ? detectedTheme : config.theme)

    useEffect(() => {
        const handleMessage = (event: MessageEvent<HostMessage>) => {
            const message = event.data
            if (!message || typeof message.type !== 'string') return

            if (message.type === 'SET_CONTENT') {
                setContent(message.content)
                setContentUrl(message.url)
                setFileName(message.fileName ?? 'Markdown')
                setRelativePath(message.relativePath)
                setConfig(current => message.config ?? current)
                if (message.config) themeSettingRef.current = message.config.theme
                if (!initializedRef.current && message.config) {
                    initializedRef.current = true
                    setSidebarOpen(message.config.showToc && tocFits())
                }
                setDroppedFile(false)
                droppedRef.current = false
                return
            }

            if (message.type === 'CONFIG_CHANGED') {
                setConfig(message.config)
                // An explicit theme setting wins over a previous manual toggle;
                // unrelated settings (font size, TOC) keep the toggle.
                if (message.config.theme !== themeSettingRef.current) setThemeOverride(null)
                themeSettingRef.current = message.config.theme
                return
            }

            if (message.type === 'SCROLL_TO_LINE' && typeof message.line === 'number') {
                if (droppedRef.current || !syncRef.current) return
                setScrollTarget({ line: message.line, id: ++scrollTargetId.current })
            }
        }

        window.addEventListener('message', handleMessage)
        post({ type: 'READY' })
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    useEffect(() => {
        document.documentElement.dataset.theme = resolvedTheme
    }, [resolvedTheme])

    // In auto mode the preview borrows the editor's colours, so it matches
    // any VS Code theme rather than only Light+ and Dark+.
    const followVsCode = config.theme === 'auto' && !themeOverride
    useEffect(() => {
        if (followVsCode) document.documentElement.dataset.vscodeColors = ''
        else delete document.documentElement.dataset.vscodeColors
    }, [followVsCode])

    useEffect(() => {
        syncRef.current = syncEnabled
    }, [syncEnabled])

    useEffect(() => {
        document.documentElement.style.setProperty('--font-size', `${config.fontSize}px`)
    }, [config.fontSize])

    // VS Code toggles body classes when the user changes color theme, without
    // reloading the webview. Keep the detected theme in state so the toolbar
    // icon, the toggle and exports all see the same theme.
    useEffect(() => {
        let frame = 0
        const observer = new MutationObserver(() => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => setDetectedTheme(detectTheme('auto')))
        })
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
        return () => {
            observer.disconnect()
            cancelAnimationFrame(frame)
        }
    }, [])

    useEffect(() => {
        const root = previewRef.current
        if (!root) return
        const next = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
            .filter(heading => Boolean(heading.id) && !heading.classList.contains('sr-only'))
            .map(heading => ({
                level: Number(heading.tagName.slice(1)),
                id: heading.id,
                text: heading.textContent?.trim() ?? '',
            }))
        headingsRef.current = next
        setHeadings(next)
        setActiveHeading(current => next.some(heading => heading.id === current) ? current : next[0]?.id ?? '')
    }, [content])

    // Editor → Preview scroll sync.
    useEffect(() => {
        if (!scrollTarget) return
        const container = scrollRef.current
        const root = previewRef.current
        if (!container || !root) return

        const lined = Array.from(root.querySelectorAll<HTMLElement>('[data-line]'))
        if (lined.length === 0) return

        let target = lined[0]
        for (const element of lined) {
            const line = Number(element.dataset.line) - 1
            if (line <= scrollTarget.line) target = element
            else break
        }

        const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
        suppressScrollReport.current = true
        const previousBehavior = container.style.scrollBehavior
        container.style.scrollBehavior = 'auto'
        container.scrollTop = Math.max(0, offset - 16)
        container.style.scrollBehavior = previousBehavior
        const timer = setTimeout(() => {
            suppressScrollReport.current = false
        }, 160)
        return () => clearTimeout(timer)
    }, [scrollTarget])

    // Preview → Editor scroll sync, debounced on scroll stop.
    const updateProgress = useCallback(() => {
        cancelAnimationFrame(progressFrame.current)
        progressFrame.current = requestAnimationFrame(() => {
            const container = scrollRef.current
            if (!container) return
            const range = container.scrollHeight - container.clientHeight
            setProgress(range > 0 ? (container.scrollTop / range) * 100 : 100)
        })
    }, [])

    useEffect(() => {
        updateProgress()
    }, [content, updateProgress])

    const handleScroll = useCallback(() => {
        const container = scrollRef.current
        const root = previewRef.current
        if (!container || !root) return
        updateProgress()

        if (scrollTimer.current) clearTimeout(scrollTimer.current)
        scrollTimer.current = setTimeout(() => {
            const containerTop = container.getBoundingClientRect().top

            const headingsNow = headingsRef.current
            let active = headingsNow[0]?.id ?? ''
            for (const heading of headingsNow) {
                const element = document.getElementById(heading.id)
                if (element && element.getBoundingClientRect().top - containerTop <= 72) active = heading.id
                else break
            }
            setActiveHeading(active)

            if (suppressScrollReport.current || droppedRef.current || !syncRef.current) return
            const lined = Array.from(root.querySelectorAll<HTMLElement>('[data-line]'))
            if (lined.length === 0) return

            let current = lined[0]
            for (const element of lined) {
                if (element.getBoundingClientRect().top - containerTop <= 17) current = element
                else break
            }
            const line = Number(current.dataset.line) - 1
            if (Number.isFinite(line)) post({ type: 'REVEAL_LINE', line })
        }, 120)
    }, [updateProgress])

    useEffect(() => () => {
        if (scrollTimer.current) clearTimeout(scrollTimer.current)
        cancelAnimationFrame(progressFrame.current)
    }, [])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault()
                setSearchOpen(true)
            } else if (event.key === 'Escape' && searchOpen) {
                setSearchOpen(false)
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
                event.preventDefault()
                setThemeOverride(resolvedTheme === 'dark' ? 'light' : 'dark')
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [searchOpen, resolvedTheme])

    useEffect(() => {
        if (!exportOpen) return
        const close = () => setExportOpen(false)
        window.addEventListener('mousedown', close)
        return () => window.removeEventListener('mousedown', close)
    }, [exportOpen])

    const stats = useMemo(() => ({
        words: countWords(content),
        minutes: Math.max(1, Math.round(countWords(content) / WORDS_PER_MINUTE)),
        lines: content ? content.split(/\r?\n/).length : 0,
        diagrams: (content.match(/^ {0,3}(?:```|~~~)\s*mermaid\b/gm) ?? []).length,
    }), [content])

    const scrollToHeading = (heading: TocHeading) => {
        const element = document.getElementById(heading.id)
        element?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }

    const openLink = useCallback((href: string) => {
        if (href.startsWith('#')) {
            // In-page anchors resolve against the rendered DOM: its ids come
            // from the same slugger, footnote ids and duplicate headings
            // included, which a source-text search cannot match reliably.
            const root = previewRef.current
            const target = root ? findAnchorTarget(root, href) : null
            if (!target) return
            target.scrollIntoView({ block: 'start', behavior: 'smooth' })
            const line = Number(target.closest<HTMLElement>('[data-line]')?.dataset.line) - 1
            if (Number.isFinite(line) && !droppedRef.current && syncRef.current) post({ type: 'REVEAL_LINE', line })
            return
        }
        // A dropped file has no location on disk, so its relative links
        // cannot be resolved; only external links still make sense.
        if (droppedRef.current && !/^(https?:|mailto:)/i.test(href)) return
        post({ type: 'OPEN_LINK', href })
    }, [])

    const exportAs = async (type: 'EXPORT_HTML' | 'EXPORT_PDF') => {
        const root = previewRef.current
        if (!root) return
        setExportOpen(false)
        // Print output is always light: dark Pele fills and token colors are
        // hard to read on paper even when the preview itself is dark.
        const html = await buildExportHtml(root, {
            title: fileName,
            theme: type === 'EXPORT_PDF' ? 'light' : resolvedTheme,
        })
        post({ type, html, suggestedName: baseName(fileName) })
    }

    const onDrop = async (event: React.DragEvent) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (!file) return
        if (!/\.(md|markdown|mdown|mkd|mdx|mdtxt|markdoc|rmd|qmd)$/i.test(file.name) && file.type !== 'text/markdown') return
        const text = await file.text()
        setContent(text)
        setFileName(file.name)
        setContentUrl(undefined)
        setDroppedFile(true)
        droppedRef.current = true
    }

    return (
        <div
            className="app"
            onDragOver={event => {
                event.preventDefault()
                setDragging(true)
            }}
            onDragLeave={event => {
                const next = event.relatedTarget
                if (!(next instanceof Node) || !event.currentTarget.contains(next)) setDragging(false)
            }}
            onDrop={onDrop}
        >
            {sidebarOpen && (
                <Toc headings={headings} activeId={activeHeading} progress={progress} onSelect={scrollToHeading} />
            )}

            <div className="main">
                <header className="toolbar">
                    <button
                        type="button"
                        className={`icon-button${sidebarOpen ? ' icon-button--active' : ''}`}
                        onClick={() => setSidebarOpen(open => !open)}
                        aria-pressed={sidebarOpen}
                        title="Toggle table of contents"
                        aria-label="Toggle table of contents"
                    >
                        <SidebarIcon />
                    </button>
                    <nav className="breadcrumb" aria-label="File" title={relativePath ?? fileName}>
                        {droppedFile
                            ? <span className="breadcrumb__file">{fileName} <span className="breadcrumb__note">(dropped)</span></span>
                            : breadcrumb(relativePath, fileName).map((part, index, parts) => (
                                index === parts.length - 1
                                    ? <span key={index} className="breadcrumb__file">{part}</span>
                                    : (
                                        <span key={index} className="breadcrumb__folder">
                                            {part}
                                            <ChevronRightIcon size={12} />
                                        </span>
                                    )
                            ))}
                    </nav>
                    <div className="toolbar__actions">
                        <button
                            type="button"
                            className={`icon-button${searchOpen ? ' icon-button--active' : ''}`}
                            onClick={() => setSearchOpen(open => !open)}
                            aria-pressed={searchOpen}
                            title="Find in document (Ctrl+F)"
                            aria-label="Find in document"
                        >
                            <SearchIcon />
                        </button>
                        <button
                            type="button"
                            className={`icon-button${syncEnabled ? ' icon-button--accent' : ''}`}
                            onClick={() => setSyncEnabled(enabled => !enabled)}
                            aria-pressed={syncEnabled}
                            title={syncEnabled ? 'Scroll sync is on' : 'Scroll sync is off'}
                            aria-label="Scroll sync"
                        >
                            <SyncIcon />
                        </button>
                        <button
                            type="button"
                            className="icon-button"
                            onClick={() => setThemeOverride(resolvedTheme === 'dark' ? 'light' : 'dark')}
                            aria-pressed={resolvedTheme === 'dark'}
                            title="Toggle light/dark theme (Ctrl+D)"
                            aria-label="Toggle light/dark theme"
                        >
                            {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
                        </button>
                        <span className="toolbar__divider" aria-hidden="true" />
                        <div className="menu-wrap">
                            <button
                                type="button"
                                className="button button--export"
                                aria-haspopup="menu"
                                aria-expanded={exportOpen}
                                onClick={event => {
                                    event.stopPropagation()
                                    setExportOpen(open => !open)
                                }}
                            >
                                <DownloadIcon size={14} />
                                <span>Export</span>
                                <ChevronDownIcon size={12} />
                            </button>
                            {exportOpen && (
                                <div className="menu" role="menu" onMouseDown={event => event.stopPropagation()}>
                                    <button type="button" role="menuitem" onClick={() => void exportAs('EXPORT_HTML')}>HTML</button>
                                    <button type="button" role="menuitem" onClick={() => void exportAs('EXPORT_PDF')}>PDF (Print)</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="preview-scroll" ref={scrollRef} onScroll={handleScroll}>
                    <div className="preview-content" ref={previewRef}>
                        {content
                            ? (
                                <MarkdownPreview
                                    content={content}
                                    currentUrl={contentUrl}
                                    syntaxHighlighting={config.syntaxHighlighting}
                                    onOpenLink={openLink}
                                />
                            )
                            : <div className="empty-state">Open a Markdown file to see its preview.</div>}
                    </div>
                </div>

                <footer className="statusbar">
                    <span>{stats.words.toLocaleString('en-US')} words</span>
                    <span>{stats.minutes} min read</span>
                    <span>{stats.lines.toLocaleString('en-US')} lines</span>
                    <span>{stats.diagrams} {stats.diagrams === 1 ? 'diagram' : 'diagrams'}</span>
                    <span className={`statusbar__sync${syncEnabled ? ' statusbar__sync--on' : ''}`}>
                        Scroll sync {syncEnabled ? 'on' : 'off'}
                    </span>
                </footer>
            </div>

            <SearchPanel
                open={searchOpen}
                containerRef={previewRef}
                content={content}
                onClose={() => setSearchOpen(false)}
            />

            {dragging && (
                <div className="drop-overlay">
                    <div className="drop-overlay__card">Drop a Markdown file to preview</div>
                </div>
            )}
        </div>
    )
}
