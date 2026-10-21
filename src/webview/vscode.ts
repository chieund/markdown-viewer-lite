interface VsCodeApi {
    postMessage: (message: unknown) => void
}

declare function acquireVsCodeApi(): VsCodeApi

let api: VsCodeApi | null = null
try {
    api = acquireVsCodeApi()
} catch {
    // Browser preview (vite dev): messages simply go nowhere.
}

export function post(message: unknown): void {
    api?.postMessage(message)
}

export function hasVsCodeApi(): boolean {
    return api !== null
}
