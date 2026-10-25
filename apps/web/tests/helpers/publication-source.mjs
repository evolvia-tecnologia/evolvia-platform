import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const sources = new Set(['publication-text-style', 'public-rich-text', 'publication-rich-text-format']);
const urls = new Map();

async function sourceUrl(name) {
  if (!sources.has(name)) throw new Error('Fonte editorial de teste desconhecida.');
  if (urls.has(name)) return urls.get(name);
  let source = await readFile(new URL(`../../lib/${name}.ts`, import.meta.url), 'utf8');
  if (name !== 'publication-text-style') {
    source = source.replaceAll("'./publication-text-style'", JSON.stringify(await sourceUrl('publication-text-style')));
  }
  const url = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
  urls.set(name, url);
  return url;
}

// Native Node tests need explicit URLs; production retains bundler-resolved imports.
export async function loadPublicationSource(name) {
  return import(await sourceUrl(name));
}
