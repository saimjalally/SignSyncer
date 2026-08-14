import { cp, mkdir, rm } from 'node:fs/promises';

const outDir = new URL('../dist/', import.meta.url);
const rootFiles = ['index.html'];
const assetDirs = ['src'];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of rootFiles) {
  await cp(new URL(`../${file}`, import.meta.url), new URL(file, outDir));
}

for (const dir of assetDirs) {
  await cp(new URL(`../${dir}/`, import.meta.url), new URL(`${dir}/`, outDir), {
    recursive: true,
  });
}

console.log('Built static app into dist/');
