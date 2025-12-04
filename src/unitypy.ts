import { spawn } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SCRIPT_PATH = path.resolve(__dirname, '../scripts/unitypy_rebuild.py');

export interface UnityPyRebuildOptions {
  bundlePath: string;
  newAssetPath: string;
  outputPath: string;
  containerPath?: string;
  objectName?: string;
  pythonPath?: string;
  scriptPath?: string;
  workingDirectory?: string;
}

export async function rebuildAssetBundleWithUnityPy(options: UnityPyRebuildOptions): Promise<void> {
  const pythonCandidates = [
    options.pythonPath,
    process.env.OGY_UNITYPY_PYTHON,
    process.env.PYTHON,
    'python3',
    'python',
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim().length));

  if (pythonCandidates.length === 0) {
    throw new Error('No Python interpreter candidates available for UnityPy rebuild.');
  }

  const scriptPath = path.resolve(options.scriptPath ?? DEFAULT_SCRIPT_PATH);
  const args = [
    scriptPath,
    '--bundle',
    path.resolve(options.bundlePath),
    '--asset',
    path.resolve(options.newAssetPath),
    '--output',
    path.resolve(options.outputPath),
  ];

  if (options.containerPath) {
    args.push('--container', options.containerPath);
  }

  if (options.objectName) {
    args.push('--object', options.objectName);
  }

  let lastError: unknown = undefined;

  for (const candidate of pythonCandidates) {
    try {
      await runUnityPyScript(candidate, args, options.workingDirectory);
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        lastError = err;
        Logger.log(`UnityPy rebuild: Python interpreter '${candidate}' not found. Trying next candidate.`);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Failed to execute UnityPy rebuild script.');
}

async function runUnityPyScript(pythonExecutable: string, args: string[], workingDirectory?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pythonExecutable, args, {
      cwd: workingDirectory ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', chunk => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', chunk => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) {
        if (stdout.trim().length) {
          Logger.log(stdout.trim());
        }
        return resolve();
      }

      const errorMessage = stderr.trim().length ? stderr.trim() : stdout.trim();
      const error = new Error(`UnityPy rebuild failed with exit code ${code}. ${errorMessage}`.trim());
      (error as NodeJS.ErrnoException).code = code === null ? undefined : `${code}`;
      reject(error);
    });
  });
}
