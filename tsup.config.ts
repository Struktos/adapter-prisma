import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'unit-of-work/index': 'src/unit-of-work/index.ts',
    'repository/index': 'src/repository/index.ts',
    'types/index': 'src/types/index.ts',
    'errors/index': 'src/errors/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'node18',
  outDir: 'dist',
  external: ['@prisma/client', '@struktos/core'],
  esbuildOptions(options) {
    options.footer = {
      js: '// @struktos/prisma v0.1.0',
    };
  },
});