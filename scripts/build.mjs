import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const outDir = new URL('../dist/', import.meta.url);
const rootDir = new URL('../', import.meta.url);
const rootFiles = ['index.html'];
const assetDirs = ['src'];
const publicSupabaseEnv = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

function parseDotEnv(contents) {
  const env = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

async function loadLocalEnv() {
  const envFile = new URL('../.env', import.meta.url);

  if (!existsSync(envFile)) return {};

  return parseDotEnv(await readFile(envFile, 'utf8'));
}

function getPublicSupabaseConfig(localEnv) {
  return Object.fromEntries(
    publicSupabaseEnv.map((name) => [name, process.env[name] ?? localEnv[name] ?? '']),
  );
}

function assertNoServiceRoleConfig() {
  const forbidden = Object.keys(process.env).filter((name) => /SUPABASE.*SERVICE|SERVICE.*SUPABASE/i.test(name));

  if (forbidden.length > 0) {
    console.warn(
      `Ignoring Supabase service-role environment variables (${forbidden.join(', ')}). ` +
        'Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are injected into the browser bundle.',
    );
  }
}

async function writeSupabaseConfig(config) {
  const configFile = new URL('src/supabase-config.js', outDir);
  const contents = `window.__SUPABASE_CONFIG__ = ${JSON.stringify(
    {
      url: config.VITE_SUPABASE_URL,
      key: config.VITE_SUPABASE_ANON_KEY,
    },
    null,
    2,
  )};\n`;

  await writeFile(configFile, contents);
}

assertNoServiceRoleConfig();
const localEnv = await loadLocalEnv();
const supabaseConfig = getPublicSupabaseConfig(localEnv);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of rootFiles) {
  await cp(new URL(file, rootDir), new URL(file, outDir));
}

for (const dir of assetDirs) {
  await cp(new URL(`${dir}/`, rootDir), new URL(`${dir}/`, outDir), {
    recursive: true,
  });
}

await writeSupabaseConfig(supabaseConfig);

const configured = supabaseConfig.VITE_SUPABASE_URL && supabaseConfig.VITE_SUPABASE_ANON_KEY;
console.log(`Built static app into dist/ (${configured ? 'with' : 'without'} Supabase public config).`);
