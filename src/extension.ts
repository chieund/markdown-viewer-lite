import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { findHeadingLine } from './headings';

type ThemeSetting = 'auto' | 'light' | 'dark';

interface WebviewConfig {
    fontSize: number;
    theme: ThemeSetting;
    showToc: boolean;
    syntaxHighlighting: boolean;
}

interface ExportMessage {
    type: 'EXPORT_HTML' | 'EXPORT_PDF';
    html: string;
    suggestedName?: string;
}

interface ExportSvgMessage {
    type: 'EXPORT_SVG';
    svg: string;
    suggestedName?: string;
}

const VIEW_TYPE = 'mdpLite.preview';
const SUPPORTED_EXTENSIONS = /\.(md|markdown|mdown|mkd|mdx|mdtxt|markdoc|rmd|qmd)$/i;

let panel: vscode.WebviewPanel | undefined;
let webviewRoot: vscode.Uri | undefined;
let currentDocument: vscode.TextDocument | undefined;
let webviewReady = false;
let pendingLine: number | undefined;
let suppressEditorEcho = false;
let revealEchoTimer: ReturnType<typeof setTimeout> | undefined;
let contentTimer: ReturnType<typeof setTimeout> | undefined;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;

function getConfig(): WebviewConfig {
    const config = vscode.workspace.getConfiguration('markdownViewerLite');
    return {
        fontSize: config.get<number>('fontSize', 16),
        theme: config.get<ThemeSetting>('theme', 'auto'),
        showToc: config.get<boolean>('showToc', true),
        syntaxHighlighting: config.get<boolean>('syntaxHighlighting', true),
    };
}

function isMarkdown(document: vscode.TextDocument): boolean {
    return document.languageId === 'markdown' || SUPPORTED_EXTENSIONS.test(document.fileName);
}

function safeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'markdown';
}

function documentUrl(document: vscode.TextDocument): string {
    if (!panel) return document.uri.toString();
    try {
        return panel.webview.asWebviewUri(document.uri).toString();
    } catch {
        return document.uri.toString();
    }
}

function post(message: unknown): void {
    void panel?.webview.postMessage(message);
}

function sendContent(): void {
    if (!panel || !currentDocument || !webviewReady) return;
    post({
        type: 'SET_CONTENT',
        content: currentDocument.getText(),
        url: documentUrl(currentDocument),
        fileName: path.basename(currentDocument.fileName),
        relativePath: currentDocument.isUntitled
            ? undefined
            : vscode.workspace.asRelativePath(currentDocument.uri, false),
        config: getConfig(),
    });
    const line = pendingLine ?? visibleEditorLine();
    if (line !== undefined) {
        pendingLine = undefined;
        setTimeout(() => post({ type: 'SCROLL_TO_LINE', line }), 120);
    }
}

function visibleEditorLine(): number | undefined {
    if (!currentDocument) return undefined;
    const editor = vscode.window.visibleTextEditors.find(
        candidate => candidate.document.uri.toString() === currentDocument!.uri.toString(),
    );
    return editor?.visibleRanges[0]?.start.line;
}

function revealEditorLine(line: number): void {
    if (!currentDocument) return;
    const editor = vscode.window.visibleTextEditors.find(
        candidate => candidate.document.uri.toString() === currentDocument!.uri.toString(),
    );
    if (!editor) return;

    suppressEditorEcho = true;
    if (revealEchoTimer) clearTimeout(revealEchoTimer);
    editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
    revealEchoTimer = setTimeout(() => {
        suppressEditorEcho = false;
    }, 180);
}

function getWebviewContent(webview: vscode.Webview, webviewPath: string): string {
    const indexPath = path.join(webviewPath, 'index.html');
    let html: string;
    try {
        html = fs.readFileSync(indexPath, 'utf-8');
    } catch (error) {
        return `<!DOCTYPE html><html><body>Could not load the preview bundle: ${String(error)}</body></html>`;
    }

    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);

    const assets = webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, 'assets')));
    // Vite emits ./assets/index.js and ./assets/index.css; make both absolute
    // for the vscode-webview:// origin.
    html = html.replace(/(src|href)="\.?\/?assets\/([^"]+)"/g, (_match, attribute: string, file: string) => {
        return `${attribute}="${assets.toString().replace(/\/$/, '')}/${file}"`;
    });
    return html;
}

function setPanelTitle(document: vscode.TextDocument): void {
    if (panel) panel.title = `Preview Lite: ${path.basename(document.fileName)}`;
}

function createPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
    const webviewPath = path.join(context.extensionPath, 'out', 'webview');
    webviewRoot = vscode.Uri.file(webviewPath);
    const created = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        'Markdown Preview Lite',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                webviewRoot,
                ...(vscode.workspace.workspaceFolders?.map(folder => folder.uri) ?? []),
            ],
        },
    );

    created.webview.html = getWebviewContent(created.webview, webviewPath);
    created.onDidDispose(() => {
        panel = undefined;
        currentDocument = undefined;
        webviewReady = false;
        pendingLine = undefined;
    });

    created.webview.onDidReceiveMessage(message => {
        if (!message || typeof message.type !== 'string') return;

        if (message.type === 'READY') {
            webviewReady = true;
            sendContent();
            return;
        }

        if (message.type === 'REVEAL_LINE' && typeof message.line === 'number') {
            revealEditorLine(message.line);
            return;
        }

        if (message.type === 'EDIT_AT_LINE' && typeof message.line === 'number' && currentDocument) {
            const position = new vscode.Position(Math.max(0, message.line), 0);
            void vscode.window.showTextDocument(currentDocument, {
                selection: new vscode.Range(position, position),
                viewColumn: vscode.ViewColumn.One,
            });
            return;
        }

        if (message.type === 'OPEN_LINK' && typeof message.href === 'string') {
            void followLink(message.href);
            return;
        }

        if (message.type === 'EXPORT_HTML' || message.type === 'EXPORT_PDF') {
            void exportDocument(message as ExportMessage);
            return;
        }

        if (message.type === 'EXPORT_SVG' && typeof message.svg === 'string') {
            void exportSvg(message as ExportSvgMessage);
        }
    });

    return created;
}

async function openPreviewForDocument(
    document: vscode.TextDocument,
    line?: number,
    reveal = false,
): Promise<void> {
    if (!isMarkdown(document)) {
        vscode.window.showInformationMessage('Markdown Viewer Lite only previews Markdown files.');
        return;
    }

    currentDocument = document;
    pendingLine = line;

    if (!panel) {
        // The panel is created by the command, which has the ExtensionContext.
        // This function is only reached after that, so panel must exist.
        return;
    }

    // Opening a Markdown file outside the workspace should still resolve its
    // relative images. localResourceRoots can be replaced after creation.
    if (webviewRoot && document.uri.scheme === 'file') {
        const roots = [
            webviewRoot,
            vscode.Uri.file(path.dirname(document.uri.fsPath)),
            ...(vscode.workspace.workspaceFolders?.map(folder => folder.uri) ?? []),
        ];
        panel.webview.options = { ...panel.webview.options, localResourceRoots: roots };
    }

    setPanelTitle(document);
    // An explicit open brings the preview forward even when another tab in
    // its group covers it; following the active editor must not steal focus.
    if (reveal) panel.reveal(panel.viewColumn, true);
    if (webviewReady) sendContent();
}

async function followLink(href: string): Promise<void> {
    if (!currentDocument) return;

    if (/^(https?:|mailto:)/i.test(href)) {
        void vscode.env.openExternal(vscode.Uri.parse(href));
        return;
    }

    const [filePart, anchorPart] = href.split('#');
    if (!filePart) {
        if (anchorPart) {
            const line = findHeadingLine(currentDocument.getText(), anchorPart);
            if (line !== undefined) {
                revealEditorLine(line);
                post({ type: 'SCROLL_TO_LINE', line });
            }
        }
        return;
    }

    let targetPath: string;
    try {
        targetPath = decodeURIComponent(filePart);
    } catch {
        targetPath = filePart;
    }

    if (targetPath.startsWith('/')) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) targetPath = path.join(root, targetPath);
    } else if (currentDocument.uri.scheme === 'file') {
        targetPath = path.resolve(path.dirname(currentDocument.uri.fsPath), targetPath);
    }

    if (!fs.existsSync(targetPath)) {
        vscode.window.showWarningMessage(`Link target not found: ${href}`);
        return;
    }

    if (!SUPPORTED_EXTENSIONS.test(targetPath)) {
        // Use VS Code's own opener for local links: handing an arbitrary
        // file path to the OS (e.g. a shell script) is not safe.
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath));
        return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
    await vscode.window.showTextDocument(document, { preview: true, viewColumn: vscode.ViewColumn.One });
    const line = anchorPart ? findHeadingLine(document.getText(), anchorPart) : undefined;
    await openPreviewForDocument(document, line, true);
}

/**
 * Opens a file the extension wrote in the user's browser. In a remote window
 * (WSL, SSH, containers) the extension host's file system is not the one the
 * desktop browser sees, so a plain file:// URI would point at nothing.
 */
async function openInBrowser(file: vscode.Uri): Promise<void> {
    const remote = vscode.env.remoteName;
    const distro = process.env.WSL_DISTRO_NAME;
    if (!remote) {
        await vscode.env.openExternal(file);
        return;
    }
    if (remote === 'wsl' && distro) {
        // Windows reaches WSL files through \\wsl.localhost\<distro>\...
        const unc = vscode.Uri.from({ scheme: 'file', authority: 'wsl.localhost', path: `/${distro}${file.path}` });
        if (await vscode.env.openExternal(unc)) return;
    }
    const copy = await vscode.window.showInformationMessage(
        `Saved ${path.basename(file.fsPath)} on the remote machine. Open it in a browser on that machine, or copy it locally.`,
        'Copy Path',
    );
    if (copy === 'Copy Path') await vscode.env.clipboard.writeText(file.fsPath);
}

async function exportDocument(message: ExportMessage): Promise<void> {
    if (!message.html || typeof message.html !== 'string') return;

    const suggested = `${safeFileName(message.suggestedName ?? 'markdown')}.html`;
    const defaultDirectory = currentDocument?.uri.scheme === 'file'
        ? path.dirname(currentDocument.uri.fsPath)
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();

    if (message.type === 'EXPORT_HTML') {
        const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(defaultDirectory, suggested)),
            filters: { HTML: ['html'] },
            saveLabel: 'Export HTML',
        });
        if (!target) return;

        await fs.promises.writeFile(target.fsPath, message.html, 'utf-8');
        const open = await vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}.`, 'Open');
        if (open === 'Open') {
            void openInBrowser(target);
        }
        return;
    }

    // PDF: the VS Code webview blocks window.print(). Write a print-ready
    // file and let the user's browser produce the PDF, which keeps the
    // extension small and the text selectable.
    const directory = path.join(os.tmpdir(), 'markdown-viewer-lite');
    await fs.promises.mkdir(directory, { recursive: true });
    // A per-export name keeps a browser tab that is still printing an earlier
    // export from being overwritten underneath it.
    const target = path.join(directory, `${path.basename(suggested, '.html')}-${Date.now()}.html`);
    const printHtml = message.html.replace(
        '</body>',
        '<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script></body>',
    );
    await fs.promises.writeFile(target, printHtml, 'utf-8');
    if (!vscode.env.remoteName) {
        vscode.window.showInformationMessage('Choose “Save as PDF” in the print dialog.');
    }
    await openInBrowser(vscode.Uri.file(target));
}

async function exportSvg(message: ExportSvgMessage): Promise<void> {
    const suggested = `${safeFileName(message.suggestedName ?? 'diagram')}.svg`;
    const defaultDirectory = currentDocument?.uri.scheme === 'file'
        ? path.dirname(currentDocument.uri.fsPath)
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
    const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDirectory, suggested)),
        filters: { SVG: ['svg'] },
        saveLabel: 'Export SVG',
    });
    if (!target) return;

    const xml = message.svg.trimStart().startsWith('<?xml')
        ? message.svg
        : `<?xml version="1.0" encoding="UTF-8"?>\n${message.svg}`;
    await fs.promises.writeFile(target.fsPath, xml, 'utf-8');
    const open = await vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}.`, 'Open');
    if (open === 'Open') {
        void vscode.commands.executeCommand('vscode.open', target);
    }
}

export function activate(context: vscode.ExtensionContext): void {
    const ensurePanel = () => {
        if (panel) return;
        panel = createPanel(context);
        // Keep the status bar entry in step with the preview tab itself, not
        // only with editor switches.
        panel.onDidChangeViewState(() => updateStatusBar());
        panel.onDidDispose(() => updateStatusBar());
    };

    const openPreview = async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isMarkdown(editor.document)) {
            // The preview webview can have focus, in which case there is no
            // active text editor. Reuse the panel instead of opening a dialog.
            if (panel && currentDocument) {
                panel.reveal(panel.viewColumn, true);
                return;
            }
            await openMarkdownFile(context);
            return;
        }

        ensurePanel();
        await openPreviewForDocument(editor.document, undefined, true);
        await vscode.window.showTextDocument(editor.document, {
            preview: false,
            preserveFocus: true,
            viewColumn: vscode.ViewColumn.One,
        });
    };

    const openMarkdownFile = async (context: vscode.ExtensionContext, uri?: vscode.Uri) => {
        let target = uri;
        if (!target) {
            const selected = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    Markdown: ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'mdtxt', 'markdoc', 'rmd', 'qmd'],
                },
                openLabel: 'Open Markdown Preview',
            });
            target = selected?.[0];
        }
        if (!target) return;

        if (!SUPPORTED_EXTENSIONS.test(target.fsPath)) {
            vscode.window.showInformationMessage('Markdown Viewer Lite only previews Markdown files.');
            return;
        }

        const document = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
        ensurePanel();
        await openPreviewForDocument(document, undefined, true);
    };

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.name = 'Markdown Viewer Lite';
    statusBar.text = '$(open-preview) Markdown Lite';
    statusBar.tooltip = 'Open Markdown Preview Lite';
    statusBar.command = 'mdpLite.openPreview';

    const updateStatusBar = () => {
        const editor = vscode.window.activeTextEditor;
        if ((editor && isMarkdown(editor.document)) || panel?.visible) statusBar.show();
        else statusBar.hide();
    };
    updateStatusBar();

    context.subscriptions.push(
        statusBar,
        vscode.commands.registerCommand('mdpLite.openPreview', openPreview),
        vscode.commands.registerCommand('mdpLite.openFile', (uri?: vscode.Uri) => openMarkdownFile(context, uri)),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            updateStatusBar();
            if (!editor || !panel?.visible || !isMarkdown(editor.document)) return;
            if (currentDocument?.uri.toString() === editor.document.uri.toString()) return;
            void openPreviewForDocument(editor.document);
        }),

        vscode.workspace.onDidChangeTextDocument(event => {
            if (!currentDocument || event.document.uri.toString() !== currentDocument.uri.toString()) return;
            if (contentTimer) clearTimeout(contentTimer);
            contentTimer = setTimeout(() => {
                currentDocument = event.document;
                sendContent();
            }, 80);
        }),

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdownViewerLite')) {
                post({ type: 'CONFIG_CHANGED', config: getConfig() });
            }
        }),

        vscode.window.onDidChangeTextEditorVisibleRanges(event => {
            if (!panel?.visible || !currentDocument) return;
            if (event.textEditor.document.uri.toString() !== currentDocument.uri.toString()) return;
            if (suppressEditorEcho) return;

            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const line = event.textEditor.visibleRanges[0]?.start.line;
                if (typeof line === 'number') post({ type: 'SCROLL_TO_LINE', line });
            }, 90);
        }),
    );
}

export function deactivate(): void {
    panel?.dispose();
    panel = undefined;
}
