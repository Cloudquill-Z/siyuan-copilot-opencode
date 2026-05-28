import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const loggerSource = readFileSync(join(root, 'src/diagnostic-logger.ts'), 'utf8');
const pathsSource = readFileSync(join(root, 'src/pluginPaths.ts'), 'utf8');

const requiredExports = [
  'createDiagnosticRunId',
  'createDiagnosticLogPath',
  'createDiagnosticLogger',
  'redactString',
  'redactValue',
  'shouldStartDiagnosticLog',
];

for (const name of requiredExports) {
  if (!loggerSource.includes(`export function ${name}`)) {
    throw new Error(`diagnostic-logger.ts must export function ${name}`);
  }
}

if (!pathsSource.includes('DIAGNOSTIC_LOG_DIR')) {
  throw new Error('pluginPaths.ts must export DIAGNOSTIC_LOG_DIR');
}

const redactionPatterns = [
  'sk-[A-Za-z0-9_-]',
  'Bearer\\s+',
  'data:[^;]+;base64',
  'token|apiKey|api_key|authorization',
];

for (const pattern of redactionPatterns) {
  if (!loggerSource.includes(pattern)) {
    throw new Error(`diagnostic logger must redact pattern: ${pattern}`);
  }
}

console.log('diagnostic logger source checks passed');
