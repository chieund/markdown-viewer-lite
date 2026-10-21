import GithubSlugger from 'github-slugger';

/** Approximates the rendered text of a heading's inline Markdown. */
function headingText(source: string): string {
    return source
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, '')
        .replace(/[`*~]/g, '')
        .trim();
}

/**
 * Lists ATX and Setext headings with their 0-based line, skipping front
 * matter and fenced code (a `# comment` in a bash block is not a heading).
 */
export function headingLines(text: string): Array<{ line: number; text: string }> {
    const lines = text.split(/\r?\n/);
    const headings: Array<{ line: number; text: string }> = [];
    let fence: string | undefined;
    let index = 0;

    if (lines[0]?.trim() === '---') {
        const end = lines.findIndex((line, position) => position > 0 && /^(---|\.\.\.)\s*$/.test(line));
        if (end > 0) index = end + 1;
    }

    for (; index < lines.length; index++) {
        const line = lines[index];
        const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (fenceMatch) {
            const marker = fenceMatch[1];
            if (!fence) fence = marker;
            else if (marker[0] === fence[0] && marker.length >= fence.length && /^ {0,3}[`~]+\s*$/.test(line)) fence = undefined;
            continue;
        }
        if (fence) continue;

        const atx = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
        if (atx) {
            headings.push({ line: index, text: headingText(atx[1]) });
            continue;
        }

        const next = lines[index + 1];
        if (
            next !== undefined
            && /^ {0,3}(=+|-+)\s*$/.test(next)
            && line.trim()
            && !/^ {0,3}([-*+>|]|\d+[.)])(\s|$)/.test(line)
        ) {
            headings.push({ line: index, text: headingText(line) });
            index++;
        }
    }
    return headings;
}

export function findHeadingLine(text: string, anchor: string): number | undefined {
    let decoded = anchor;
    try {
        decoded = decodeURIComponent(anchor);
    } catch {
        // Malformed percent escapes: fall back to the literal anchor.
    }
    const wanted = decoded.replace(/^#/, '').toLowerCase();
    // The same slugger as rehype-slug, so duplicate headings get the same
    // `-1`, `-2` suffixes as their ids in the preview.
    const slugger = new GithubSlugger();
    for (const heading of headingLines(text)) {
        if (slugger.slug(heading.text) === wanted || heading.text.toLowerCase() === wanted) return heading.line;
    }
    return undefined;
}
