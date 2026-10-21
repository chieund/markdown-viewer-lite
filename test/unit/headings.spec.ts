import { expect, test } from '@playwright/test'
import { findHeadingLine, headingLines } from '../../src/headings'

const DOC = `---
title: Demo
---

# Intro

\`\`\`bash
# setup
npm install
\`\`\`

## Setup

## Setup

Setext heading
--------------

- list item
---

## \`code\` and **bold** [link](https://example.com)
`

const lineOf = (text: string) => DOC.split('\n').indexOf(text)

test('skips front matter and fenced code', () => {
    expect(headingLines(DOC).map(heading => heading.text)).toEqual([
        'Intro',
        'Setup',
        'Setup',
        'Setext heading',
        'code and bold link',
    ])
})

test('resolves anchors with the preview slugger', () => {
    expect(findHeadingLine(DOC, 'setup')).toBe(lineOf('## Setup'))
    expect(findHeadingLine(DOC, '#setup-1')).toBe(DOC.split('\n').lastIndexOf('## Setup'))
    expect(findHeadingLine(DOC, 'setext-heading')).toBe(lineOf('Setext heading'))
    expect(findHeadingLine(DOC, 'code-and-bold-link')).toBe(lineOf('## `code` and **bold** [link](https://example.com)'))
    expect(findHeadingLine(DOC, 'title-demo')).toBeUndefined()
    expect(findHeadingLine(DOC, '%E0%A4%A')).toBeUndefined()
})
