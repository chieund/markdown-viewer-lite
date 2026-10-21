import { isValidElement, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import type { PluggableList } from 'unified'
import CodeBlock from './CodeBlock'
import PeleDiagram from './PeleDiagram'
import rehypeLineNumbers from '../rehypeLineNumbers'
import { sanitizeSchema } from '../sanitizeSchema'

const REMARK_PLUGINS: PluggableList = [remarkGfm]
const REHYPE_PLUGINS: PluggableList = [
    rehypeLineNumbers,
    rehypeRaw,
    [rehypeSanitize, sanitizeSchema],
    rehypeSlug,
]

function textOf(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (isValidElement(node)) {
        return textOf((node.props as { children?: ReactNode }).children)
    }
    return ''
}

interface MarkdownPreviewProps {
    content: string
    currentUrl?: string
    syntaxHighlighting?: boolean
    onOpenLink?: (href: string) => void
}

export default function MarkdownPreview({
    content,
    currentUrl,
    syntaxHighlighting = true,
    onOpenLink,
}: MarkdownPreviewProps) {
    const components = useMemo<Components>(() => ({
        pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children
            if (!isValidElement(child)) return <pre>{children}</pre>

            const props = child.props as { className?: string; children?: ReactNode }
            const language = /language-([\w+#.-]+)/.exec(props.className ?? '')?.[1]
            const code = textOf(props.children).replace(/\n$/, '')

            if (language === 'mermaid') return <PeleDiagram chart={code} />
            return <CodeBlock code={code} language={language} highlight={syntaxHighlighting} />
        },

        code({ className, children }) {
            return <code className={className}>{children}</code>
        },

        a({ href, children }) {
            return (
                <a
                    href={href}
                    onClick={event => {
                        event.preventDefault()
                        if (href) onOpenLink?.(href)
                    }}
                >
                    {children}
                </a>
            )
        },

        img({ src, alt, ...rest }) {
            let resolved = src
            if (src && currentUrl && !/^(https?:|data:|blob:)/.test(src)) {
                try {
                    resolved = new URL(src, currentUrl).href
                } catch {
                    resolved = src
                }
            }
            return <img src={resolved} alt={alt ?? ''} loading="lazy" {...rest} />
        },

        table({ children }) {
            return (
                <div className="table-wrap">
                    <table>{children}</table>
                </div>
            )
        },
    }), [currentUrl, onOpenLink, syntaxHighlighting])

    return (
        <article className="markdown-body">
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={components}
            >
                {content}
            </ReactMarkdown>
        </article>
    )
}
