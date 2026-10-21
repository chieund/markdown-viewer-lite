import { useMemo } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-diff'
import 'prismjs/components/prism-docker'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-powershell'

const ALIASES: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    py: 'python',
    rb: 'ruby',
    md: 'markdown',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
    dockerfile: 'docker',
    ps1: 'powershell',
    'c++': 'cpp',
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

interface CodeBlockProps {
    code: string
    language?: string
    highlight?: boolean
}

export default function CodeBlock({ code, language, highlight = true }: CodeBlockProps) {
    const languageName = language?.toLowerCase()
    const grammarName = languageName ? ALIASES[languageName] ?? languageName : undefined

    const html = useMemo(() => {
        if (!highlight || !grammarName) return escapeHtml(code)
        const grammar = Prism.languages[grammarName]
        if (!grammar) return escapeHtml(code)
        try {
            return Prism.highlight(code, grammar, grammarName)
        } catch {
            return escapeHtml(code)
        }
    }, [code, grammarName, highlight])

    return (
        <pre className="code-block">
            <code
                className={languageName ? `language-${languageName}` : undefined}
                // Prism output is generated from the code text and escaped by
                // Prism itself; unknown languages use escapeHtml above.
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </pre>
    )
}
