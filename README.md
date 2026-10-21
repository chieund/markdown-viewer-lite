<img src="media/icon.png" width="112" alt="Markdown Viewer Lite icon">

# Markdown Viewer Lite (Pele)

A small, fast Markdown preview for VS Code. Diagrams are rendered by
[Pele](https://pele.run/) instead of Mermaid.js, so the preview bundle stays
compact and diagrams render synchronously.

This extension is separate from **Markdown Viewer Premium** and can be installed
alongside it (`bumkom.markdown-viewer-lite` vs `bumkom.markdown-viewer-premium`).

## Features

- Side-by-side editor and preview (`Open Markdown Preview Lite`).
- Open a Markdown file from disk or the Explorer context menu.
- Drag a Markdown file onto the preview to render it.
- Light and dark themes that follow VS Code, with a manual toggle.
- Table of contents sidebar with active-heading tracking.
- In-preview search with match count and previous/next navigation (`Ctrl+F`).
- Prism syntax highlighting for common languages.
- Mermaid diagrams rendered by Pele (flowchart, sequence, class, state, ER,
  gantt, pie, journey, mindmap, timeline, Git graph, and more).
- Full-screen diagram viewer with zoom, pan, SVG download and Mermaid source copy.
- Export a standalone HTML file, or a print-ready page for **Save as PDF**.
- Scroll sync in both directions using source-line markers.

## Usage

1. Open a Markdown file.
2. Run **Markdown Lite: Open Markdown Preview Lite** from the Command Palette,
   click the preview icon in the editor title bar, right-click the editor and
   choose **Open Markdown Preview Lite**, or click **Markdown Lite** in the
   status bar.
3. Use the toolbar to toggle the contents sidebar, search, theme, or export.

You can also run **Markdown Lite: Open Markdown File in Preview Lite** and pick
any `*.md` file. Files can be outside the current workspace.

### Keyboard shortcuts (inside the preview)

| Shortcut | Action |
| --- | --- |
| `Ctrl+F` / `Cmd+F` | Find in document |
| `Ctrl+D` / `Cmd+D` | Toggle light/dark theme |
| `Enter` / `Shift+Enter` | Next / previous search match |
| `Esc` | Close search or diagram viewer |
| `+` / `-` / `0` | Zoom in / out / fit diagram (viewer only) |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `markdownViewerLite.fontSize` | `16` | Base preview font size (px). |
| `markdownViewerLite.theme` | `auto` | `auto`, `light`, or `dark`. |
| `markdownViewerLite.showToc` | `true` | Show the contents sidebar when a preview opens. |
| `markdownViewerLite.syntaxHighlighting` | `true` | Highlight fenced code blocks with Prism. |

## Export

- **Export → HTML** writes a self-contained HTML file. Relative images are
  inlined when the webview can read them.
- **Export → PDF (Print)** writes a temporary print-ready page and opens it in
  your browser. Choose **Save as PDF** in the print dialog. This keeps a PDF
  engine out of the extension.

## Pele support

Pele supports most Mermaid diagram types. ZenUML and Mermaid plugins are not
supported; the preview shows the error and keeps the Mermaid source visible.

## Development

From the monorepo root:

```bash
pnpm install
pnpm build:vscode-lite
pnpm package:vscode-lite
```

The packaged VSIX is written to `packages/vscode-lite/`.

## Differences from Premium

Lite intentionally has no Mermaid.js, React Flow, PlantUML, Vega, ZenUML, or
pdfmake. It uses Pele only, a single preview panel, and browser printing for
PDF. Premium remains the full-featured package.

## License

MIT
