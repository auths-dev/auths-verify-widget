import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

function inlineWasmPlugin(): Plugin {
  return {
    name: 'inline-wasm',
    transform(code, id) {
      if (!process.env.INLINE_WASM) return null;
      if (!id.includes('verifier-bridge')) return null;

      // Replace the WASM sentinel with inlined base64
      if (code.includes('__INLINE_WASM_BASE64__')) {
        try {
          const wasmPath = resolve(__dirname, 'wasm/auths_verifier_bg.wasm');
          const wasmBuffer = readFileSync(wasmPath);
          const base64 = wasmBuffer.toString('base64');
          return code.replace(
            "'__INLINE_WASM_BASE64__'",
            `'${base64}'`
          );
        } catch {
          console.warn('WASM file not found for inlining, using empty sentinel');
          return null;
        }
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const isSlim = mode === 'slim';
  const isCore = mode === 'core';

  return {
    // The core entry targets modern runtimes (Node 20+, Deno, Bun, edge) that
    // support native top-level await, so it skips the top-level-await transform
    // — that transform gates exports behind a `__tla` promise, which would break
    // `import { verifyAttestationJson } from '.../core'`. The browser builds keep
    // the transform for broad compatibility.
    plugins: isCore
      ? [wasm(), inlineWasmPlugin()]
      : [wasm(), topLevelAwait(), inlineWasmPlugin()],
    build: {
      // Native top-level await for the core build (WASM instantiates at load).
      ...(isCore ? { target: 'esnext' } : {}),
      lib: {
        // The DOM-free core entry vs. the <auths-verify> component entry.
        entry: resolve(__dirname, isCore ? 'src/core.ts' : 'src/auths-verify.ts'),
        name: isCore ? 'AuthsVerifyCore' : 'AuthsVerify',
        formats: ['es'],
        fileName: () => isCore ? 'core.mjs' : isSlim ? 'slim/auths-verify.mjs' : 'auths-verify.mjs',
      },
      outDir: 'dist',
      // Only the full build clears dist; core/slim append to it.
      emptyOutDir: !isSlim && !isCore,
      sourcemap: true,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        '@auths/verifier': resolve(__dirname, '../auths/packages/auths-verifier-ts/src'),
        'auths-verifier-wasm': resolve(__dirname, 'wasm/auths_verifier.js'),
      },
    },
  };
});
