import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'

const ALLOWED_CLASS = /^(?:language-[\w+#.-]+|contains-task-list|task-list-item|footnotes|sr-only)$/

/**
 * GitHub's schema, narrowed to what this viewer needs. Raw HTML is allowed
 * but script/style/iframe/event handlers and javascript: URLs are dropped.
 */
export const sanitizeSchema: SanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'mark', 'abbr', 'center'],
    attributes: {
        ...defaultSchema.attributes,
        '*': [
            ...(defaultSchema.attributes?.['*'] ?? []),
            ['className', ALLOWED_CLASS],
            // hast stores data-* as camelCase; rehype-raw normalises the
            // attribute, so both spellings are needed to survive sanitizing.
            'data-line',
            'dataLine',
        ],
        code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]],
    },
    protocols: {
        ...defaultSchema.protocols,
        src: [...(defaultSchema.protocols?.src ?? []), 'data', 'file'],
    },
}
