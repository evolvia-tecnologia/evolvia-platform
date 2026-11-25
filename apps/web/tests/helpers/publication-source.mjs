import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const sources = new Set(['publication-text-style', 'public-rich-text', 'publication-rich-text-format']);
const urls = new Map();

sources.add('ckeditor-rich-text');

async function sourceUrl(name) {
  if (!sources.has(name)) throw new Error('Fonte editorial de teste desconhecida.');
  if (urls.has(name)) return urls.get(name);
  let source = await readFile(new URL(`../../lib/${name}.ts`, import.meta.url), 'utf8');
  if (name !== 'publication-text-style') {
    source = source.replace(/['"]\.\/publication-text-style['"]/gu, JSON.stringify(await sourceUrl('publication-text-style')));
  }
  if (name === 'ckeditor-rich-text') {
    source = source.replace(/['"]\.\/public-rich-text['"]/gu, JSON.stringify(await sourceUrl('public-rich-text')));
  }
  const url = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
  urls.set(name, url);
  return url;
}

// Native Node tests need explicit URLs; production retains bundler-resolved imports.
export async function loadPublicationSource(name) {
  return import(await sourceUrl(name));
}
