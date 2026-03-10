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

  return {
    plugins: [wasm(), topLevelAwait(), inlineWasmPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/auths-verify.ts'),
        name: 'AuthsVerify',
        formats: ['es'],
        fileName: () => isSlim ? 'slim/auths-verify.mjs' : 'auths-verify.mjs',
      },
      outDir: 'dist',
      emptyOutDir: !isSlim,
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
