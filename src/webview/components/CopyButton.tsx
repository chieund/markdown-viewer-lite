import { useEffect, useRef, useState } from 'react'
import { copyText } from '../clipboard'
import { CheckIcon, CopyIcon } from './Icons'

interface CopyButtonProps {
    text: string
    label?: string
    /** Accessible name; defaults to the visible label. */
    ariaLabel?: string
}

export default function CopyButton({ text, label = 'Copy', ariaLabel }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)
    const timer = useRef<number | undefined>(undefined)

    useEffect(() => () => window.clearTimeout(timer.current), [])

    const onClick = async () => {
        await copyText(text)
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1600)
    }

    return (
        <button
            type="button"
            className="block-action"
            onClick={() => void onClick()}
            aria-label={ariaLabel ?? label}
            title={ariaLabel ?? label}
        >
            {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            <span>{copied ? 'Copied' : label}</span>
        </button>
    )
}
