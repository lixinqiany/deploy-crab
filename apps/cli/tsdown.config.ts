import { getRuntimeDependencies } from '../../scripts/build/dependencies.ts';
import { prepareDist } from '../../scripts/build/dist.ts';
import { defineConfig } from 'tsdown';

const { importer, bundledPackages } = await getRuntimeDependencies(
  import.meta.dirname,
);
const external = Object.keys(importer.specifiers);

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  target: 'node24',
  format: 'esm',
  fixedExtension: false,
  sourcemap: true,
  deps: {
    alwaysBundle: bundledPackages,
    neverBundle: external,
    onlyBundle: [],
    onlyImport: external,
  },
  hooks: {
    'build:done': async () => {
      await prepareDist(import.meta.dirname, 'index.js');
    },
  },
});
