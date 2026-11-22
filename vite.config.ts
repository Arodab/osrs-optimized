import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `base` must be identical for dev, build and preview. `vite preview` runs with
 * command === 'serve', so making base conditional on the command silently breaks
 * preview: the built index.html asks for /specscape/assets/... while the server
 * only serves /assets/..., and every asset falls through to the SPA fallback.
 *
 * Defaults to the GitHub Pages project-site path. For a root domain, build with
 * BASE=/ (in Git Bash use MSYS_NO_PATHCONV=1, which otherwise rewrites a bare
 * "/" into a Windows path).
 */
const base = process.env.BASE ?? '/osrs-optimized/';
const skillingProxy = `${base.replace(/\/$/, '')}/skilling-api/`;
const apiOrigin = 'https://osrs-skilling-methods.profoundbadge64.chatgpt.site';
const policy = ["default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "worker-src 'self'",
  "img-src 'self' data: https://oldschool.runescape.wiki", `connect-src 'self' ${apiOrigin}`, "base-uri 'none'", "form-action 'none'"].join('; ');

export default defineConfig({
  plugins: [react(), {
    name: 'production-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  }],
  base,
  server: {
    proxy: {
      [skillingProxy]: {
        target: apiOrigin,
        changeOrigin: true,
        rewrite: (path) => `/api/${path.slice(skillingProxy.length)}`,
      },
    },
  },
  worker: { format: 'es' },
});
