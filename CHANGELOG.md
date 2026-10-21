# Changelog

## 0.2.0

- Redesigned preview: SVG toolbar icons, a file breadcrumb, a numbered outline with heading filter and reading progress, and near full-width content.
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) render as callouts.
- Code blocks show their language and a Copy button; Pele diagrams get a header with Source, SVG and full-screen actions.
- Scroll sync can be paused from the toolbar; the status bar shows reading time and sync state.
- In auto theme mode the preview uses the active VS Code theme's editor colours.
- Tables: left-aligned headers (GFM alignment still applies) and striped rows.
- Sharper icon: the same design redrawn as vector, with a cleaner Markdown badge and page shadow.
- In-page anchors and footnotes now scroll inside the preview, including duplicate headings (`#setup-1`).
- Links to other files no longer match `# comments` inside code blocks, and support Setext headings and front matter.
- "Open Markdown Preview Lite" brings the preview forward when another tab covers it.
- Auto theme stays in sync with VS Code: the toggle icon, Ctrl+D and exports use the current theme.
- Scroll sync keeps its place across code blocks and diagrams.
- Syntax highlighting for C, C++, C#, PHP, Ruby, Kotlin and Swift.
- PDF export and "Open" after HTML export work in WSL; other remote windows offer to copy the file path.
- Search keeps highlighting the current match past the first 500 results.
- Tighter webview Content Security Policy (no inline scripts).

## 0.1.2

- Added Marketplace screenshots, GitHub SEO metadata, and CI packaging.
- Improved README copy, install instructions, FAQ, and repository metadata.

## 0.1.1

- Added a full-screen diagram viewer with zoom, pan, SVG download and Mermaid source copy.
- The viewer traps focus, closes with `Esc`, and restores focus to the diagram button.
- Fixed diagram state being lost when the preview re-rendered.

## 0.1.0

- Initial Lite extension.
- Side-by-side Markdown preview with Pele diagram rendering.
- Table of contents, in-preview search, Prism syntax highlighting.
- Light/dark themes, scroll sync, drag-and-drop.
- Standalone HTML export and print-ready PDF export.
