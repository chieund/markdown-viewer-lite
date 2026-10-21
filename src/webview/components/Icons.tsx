import type { ReactNode } from 'react'

/**
 * Stroke icons drawn on a 16px grid. Text glyphs (☰ ⌕ ☾) render at
 * different sizes and weights per OS font, so the toolbar uses these.
 */
function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
    return (
        <svg
            className="icon"
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {children}
        </svg>
    )
}

type IconProps = { size?: number }

export const SidebarIcon = (props: IconProps) => (
    <Icon {...props}><rect x="2" y="2.5" width="12" height="11" rx="2" /><path d="M6 2.5v11" /></Icon>
)

export const SearchIcon = (props: IconProps) => (
    <Icon {...props}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></Icon>
)

export const SyncIcon = (props: IconProps) => (
    <Icon {...props}><path d="M5 2v12M2.5 4.5L5 2l2.5 2.5M11 14V2M8.5 11.5L11 14l2.5-2.5" /></Icon>
)

export const MoonIcon = (props: IconProps) => (
    <Icon {...props}><path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" /></Icon>
)

export const SunIcon = (props: IconProps) => (
    <Icon {...props}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </Icon>
)

export const DownloadIcon = (props: IconProps) => (
    <Icon {...props}><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 12.5v1h11v-1" /></Icon>
)

export const ChevronDownIcon = (props: IconProps) => (
    <Icon {...props}><path d="M4 6l4 4 4-4" /></Icon>
)

export const ChevronRightIcon = (props: IconProps) => (
    <Icon {...props}><path d="M6 3l5 5-5 5" /></Icon>
)

export const CopyIcon = (props: IconProps) => (
    <Icon {...props}>
        <rect x="5" y="5" width="9" height="9" rx="1.5" />
        <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
    </Icon>
)

export const CheckIcon = (props: IconProps) => (
    <Icon {...props}><path d="M3 8.5l3 3 7-7" /></Icon>
)

export const ExpandIcon = (props: IconProps) => (
    <Icon {...props}><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" /></Icon>
)

export const CloseIcon = (props: IconProps) => (
    <Icon {...props}><path d="M4 4l8 8M12 4l-8 8" /></Icon>
)

export const ArrowUpIcon = (props: IconProps) => (
    <Icon {...props}><path d="M8 13V3M4 7l4-4 4 4" /></Icon>
)

export const ArrowDownIcon = (props: IconProps) => (
    <Icon {...props}><path d="M8 3v10M4 9l4 4 4-4" /></Icon>
)
