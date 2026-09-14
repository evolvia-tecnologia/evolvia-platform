import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 65_536;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:#/-]{0,79}$/u;

export class ContractError extends Error {}

function contract(condition, message) {
  if (!condition) throw new ContractError(message);
}

export function normalizeOwnedPath(value) {
  contract(typeof value === 'string', 'Cada owned path precisa ser uma string.');
  contract(value.length > 0 && value.length <= 512, 'Owned path vazio ou acima de 512 caracteres.');
  contract(!/[\0-\x1f\x7f]/u.test(value), 'Owned path contém caractere de controle.');
  contract(!/^[/\\]/u.test(value) && !/^[A-Za-z]:[/\\]/u.test(value), 'Owned path absoluto não é permitido.');

  const directory = /[/\\]$/u.test(value);
  let path = value.replaceAll('\\', '/');
  while (path.startsWith('./')) path = path.slice(2);
  if (directory) path = path.slice(0, -1);

  const segments = path.split('/');
  contract(segments.length > 0 && segments.every((part) => part && part !== '.' && part !== '..'),
    'Owned path contém segmento vazio, ponto ou ..');

  return { path: segments.join('/'), kind: directory ? 'directory' : 'file' };
}

function relation(left, right) {
  if (left.path === right.path) return 'SAME_PATH';
  if (left.kind === 'directory' && right.path.startsWith(`${left.path}/`)) return 'DIRECTORY_CONTAINS_PATH';
  if (right.kind === 'directory' && left.path.startsWith(`${right.path}/`)) return 'DIRECTORY_CONTAINS_PATH';
  return null;
}

export function analyzeOwnedPaths(input) {
  contract(input && typeof input === 'object' && !Array.isArray(input), 'Entrada precisa ser um objeto JSON.');
  contract(Array.isArray(input.fronts) && input.fronts.length > 0, 'Entrada precisa declarar fronts não vazias.');

  const ids = new Set();
  const fronts = input.fronts.map((front) => {
    contract(front && typeof front === 'object' && !Array.isArray(front), 'Cada frente precisa ser um objeto.');
    contract(typeof front.id === 'string' && ID_PATTERN.test(front.id), 'Identificador de frente inválido.');
    contract(!ids.has(front.id), `Identificador de frente duplicado: ${front.id}.`);
    ids.add(front.id);
    contract(Array.isArray(front.paths) && front.paths.length > 0, `A frente ${front.id} não declarou paths.`);

    const seen = new Set();
    const paths = front.paths.map(normalizeOwnedPath);
    for (const entry of paths) {
      contract(!seen.has(entry.path), `A frente ${front.id} duplicou o path ${entry.path}.`);
      seen.add(entry.path);
    }
    return { id: front.id, paths: paths.sort((a, b) => a.path.localeCompare(b.path)) };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const conflicts = [];
  for (let leftIndex = 0; leftIndex < fronts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < fronts.length; rightIndex += 1) {
      const left = fronts[leftIndex];
      const right = fronts[rightIndex];
      for (const leftPath of left.paths) {
        for (const rightPath of right.paths) {
          const type = relation(leftPath, rightPath);
          if (type) conflicts.push({
            frontA: left.id,
            pathA: leftPath.path,
            frontB: right.id,
            pathB: rightPath.path,
            type,
          });
        }
      }
    }
  }

  conflicts.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { version: 1, status: conflicts.length ? 'CONFLICT' : 'CLEAR', conflicts };
}

export async function analyzeOwnedPathsFile(filename) {
  let metadata;
  try {
    metadata = await stat(filename);
  } catch (error) {
    const message = error?.code === 'ENOENT'
      ? 'Arquivo de entrada não encontrado.'
      : error?.code === 'EACCES'
        ? 'Sem permissão para acessar o arquivo de entrada.'
        : 'Não foi possível acessar o arquivo de entrada.';
    throw new ContractError(message);
  }

  contract(metadata.isFile(), 'Entrada precisa ser um arquivo regular.');
  contract(metadata.size <= MAX_INPUT_BYTES, 'Arquivo de entrada excede 64 KiB.');

  let source;
  try {
    source = await readFile(filename);
  } catch (error) {
    const message = error?.code === 'EACCES'
      ? 'Sem permissão para ler o arquivo de entrada.'
      : 'Não foi possível ler o arquivo de entrada.';
    throw new ContractError(message);
  }

  let input;
  try {
    input = JSON.parse(source.toString('utf8'));
  } catch {
    throw new ContractError('Arquivo de entrada não contém JSON válido.');
  }
  return analyzeOwnedPaths(input);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const filename = process.argv[2];
  if (!filename || process.argv.length !== 3) {
    console.error('Uso: node scripts/detect-owned-path-conflicts.mjs <arquivo.json>');
    process.exitCode = 1;
  } else {
    analyzeOwnedPathsFile(filename)
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.status === 'CONFLICT' ? 2 : 0;
      })
      .catch((error) => {
        console.error(error instanceof ContractError ? error.message : 'Falha inesperada ao analisar owned paths.');
        process.exitCode = 1;
      });
  }
}
