import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
    root: resolve(__dirname, 'src/webview'),
    plugins: [react()],
    // Relative, not '/': VS Code loads the built webview from a deep
    // asWebviewUri() path, so root-absolute asset URLs 404.
    base: './',
    build: {
        outDir: resolve(__dirname, 'out/webview'),
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'src/webview/index.html'),
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        }
    }
})
