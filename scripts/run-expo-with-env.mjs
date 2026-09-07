import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REQUIRED_PUBLIC_VARIABLES = [
  'EXPO_PUBLIC_MYMANGA_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [environmentFileArgument, ...expoArguments] = process.argv.slice(2);

if (!environmentFileArgument || expoArguments.length === 0) {
  console.error(
    'Uso: node scripts/run-expo-with-env.mjs <archivo-env> <comando-expo> [...argumentos]',
  );
  process.exit(1);
}

const environmentFile = resolve(projectRoot, environmentFileArgument);

if (!existsSync(environmentFile)) {
  console.error(
    `No existe ${environmentFileArgument}. Créalo a partir de ${environmentFileArgument}.example.`,
  );
  process.exit(1);
}

function parseEnvironmentFile(contents) {
  const variables = {};

  for (const rawLine of contents.replace(/^\uFEFF/, '').split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);

    if (!match) {
      throw new Error(`Línea inválida en ${environmentFileArgument}: ${rawLine}`);
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    variables[key] = value;
  }

  return variables;
}

let selectedVariables;

try {
  selectedVariables = parseEnvironmentFile(readFileSync(environmentFile, 'utf8'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const missingVariables = REQUIRED_PUBLIC_VARIABLES.filter(
  (key) => !selectedVariables[key]?.trim(),
);

if (missingVariables.length > 0) {
  console.error(
    `Faltan variables obligatorias en ${environmentFileArgument}: ${missingVariables.join(', ')}`,
  );
  process.exit(1);
}

const childEnvironment = { ...process.env };

for (const key of Object.keys(childEnvironment)) {
  if (key.startsWith('EXPO_PUBLIC_')) {
    delete childEnvironment[key];
  }
}

Object.assign(childEnvironment, selectedVariables, {
  EXPO_NO_DOTENV: '1',
});

const expoCli = resolve(projectRoot, 'node_modules', 'expo', 'bin', 'cli');

if (!existsSync(expoCli)) {
  console.error('No se encontró Expo CLI. Ejecuta npm install antes de continuar.');
  process.exit(1);
}

console.log(`Configuración Expo: ${environmentFileArgument}`);

const result = spawnSync(process.execPath, [expoCli, ...expoArguments], {
  cwd: projectRoot,
  env: childEnvironment,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
