import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Static build of the Embed Builder / live playground for GitHub Pages.
 *
 * The page bundles only the lightweight `detect` + `embed-snippet` logic; the
 * live preview loads the widget from the CDN at runtime (it is not bundled), so
 * this build needs no WASM and no Rust toolchain.
 *
 * `base: './'` keeps asset URLs relative so the site works under the
 * project-pages path (`https://<user>.github.io/auths-verify-widget/`).
 */
export default defineConfig({
  root: resolve(__dirname, 'examples'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-pages'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        builder: resolve(__dirname, 'examples/embed-builder.html'),
      },
    },
  },
});
