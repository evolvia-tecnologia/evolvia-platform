'use client';

import { useEffect, useRef } from 'react';
import {
  Alignment,
  Bold,
  ClassicEditor,
  Essentials,
  FontColor,
  FontFamily,
  FontSize,
  Heading,
  Italic,
  Link,
  List,
  Paragraph,
  RemoveFormat,
} from 'ckeditor5';
import coreTranslations from 'ckeditor5/translations/pt-br.js';
import 'ckeditor5/ckeditor5.css';
import {
  htmlToMarkup,
  markupToHtml,
  RICH_TEXT_EDITOR_COLORS,
  RICH_TEXT_EDITOR_FONTS,
} from '../lib/ckeditor-rich-text';
import type { RichTextColor } from '../lib/publication-text-style';

const COLOR_LABEL: Record<RichTextColor, string> = {
  navy: 'Azul marinho',
  'navy-soft': 'Azul marinho claro',
  blue: 'Azul',
  'blue-soft': 'Azul escuro',
  text: 'Texto',
  muted: 'Cinza',
  success: 'Verde',
  warning: 'Âmbar',
  danger: 'Vermelho',
};

const editorQueue = new WeakMap<HTMLElement, Promise<void>>();

function enqueueEditor(element: HTMLElement, task: () => Promise<void>): Promise<void> {
  const previous = editorQueue.get(element) ?? Promise.resolve();
  const next = previous.then(task, task);
  editorQueue.set(element, next.then(() => undefined, () => undefined));
  return next;
}

const editorConfig = {
  licenseKey: 'GPL',
  language: 'pt-br',
  translations: [coreTranslations],
  plugins: [
    Essentials, Paragraph, Heading, Bold, Italic, List, Link,
    Alignment, FontFamily, FontSize, FontColor, RemoveFormat,
  ],
  toolbar: {
    items: [
      'heading', '|', 'bold', 'italic', '|',
      'bulletedList', 'numberedList', '|', 'link', '|',
      'alignment', '|', 'fontFamily', 'fontSize', 'fontColor', '|',
      'undo', 'redo', 'removeFormat',
    ],
    shouldNotGroupWhenFull: true,
  },
  heading: {
    options: [
      { model: 'paragraph' as const, title: 'Parágrafo', class: 'ck-heading_paragraph' },
      { model: 'heading2' as const, view: 'h2', title: 'Título', class: 'ck-heading_heading2' },
    ],
  },
  alignment: { options: ['left' as const, 'center' as const, 'right' as const] },
  fontFamily: {
    options: [
      {
        title: 'Sans',
        model: RICH_TEXT_EDITOR_FONTS.sans,
        view: { name: 'span', styles: { 'font-family': RICH_TEXT_EDITOR_FONTS.sans }, priority: 7 },
      },
      {
        title: 'Serif',
        model: RICH_TEXT_EDITOR_FONTS.serif,
        view: { name: 'span', styles: { 'font-family': RICH_TEXT_EDITOR_FONTS.serif }, priority: 7 },
      },
    ],
    supportAllValues: false,
  },
  fontSize: {
    options: [12, 14, 16, 18, 20, 24],
    supportAllValues: false,
  },
  fontColor: {
    colors: (Object.entries(RICH_TEXT_EDITOR_COLORS) as Array<[RichTextColor, string]>).map(([key, color]) => ({
      color,
      label: COLOR_LABEL[key],
    })),
    colorPicker: false as const,
  },
  link: { addTargetToExternalLinks: true, defaultProtocol: 'https://' },
};

export default function PublicationCkEditor({
  value,
  onChange,
  onBlur,
  onFocus,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  onFocus?: () => void;
  maxLength: number;
  disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const accepted = useRef(value);
  const editorRef = useRef<ClassicEditor | null>(null);
  const disabledRef = useRef(disabled);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onFocusRef = useRef(onFocus);
  const maxLengthRef = useRef(maxLength);
  disabledRef.current = disabled;
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onFocusRef.current = onFocus;
  maxLengthRef.current = maxLength;

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    let alive = true;
    let instance: ClassicEditor | null = null;
    let applying = false;

    function replace(current: ClassicEditor, html: string) {
      applying = true;
      current.setData(html);
      applying = false;
    }

    function revert(current: ClassicEditor) {
      const undo = current.commands.get('undo');
      if (undo?.isEnabled) {
        queueMicrotask(() => {
          if (!alive || applying) return;
          applying = true;
          current.execute('undo');
          applying = false;
        });
        return;
      }
      replace(current, markupToHtml(accepted.current));
    }

    function commit(current: ClassicEditor) {
      if (!alive || applying) return;
      const markup = htmlToMarkup(current.getData());
      if (markup === null) {
        replace(current, markupToHtml(accepted.current));
        return;
      }
      if (markup.length > maxLengthRef.current) {
        revert(current);
        return;
      }
      if (markup === accepted.current) return;
      accepted.current = markup;
      onChangeRef.current(markup);
    }

    const ready = enqueueEditor(element, async () => {
      if (!alive) return;
      const initial = markupToHtml(accepted.current);
      const created = await ClassicEditor.create(initial, editorConfig);
      const view = created.ui.element;
      if (!alive || !element.isConnected || !view) {
        await created.destroy();
        return;
      }
      element.replaceChildren(view);
      instance = created;
      editorRef.current = created;
      if (markupToHtml(accepted.current) !== initial) created.setData(markupToHtml(accepted.current));
      if (disabledRef.current) created.enableReadOnlyMode('evolvia');
      created.model.document.on('change:data', () => commit(created));
      created.editing.view.document.on('blur', () => {
        if (!alive) return;
        commit(created);
        onBlurRef.current?.(accepted.current);
      });
      created.editing.view.document.on('focus', () => {
        if (alive) onFocusRef.current?.();
      });
    });

    return () => {
      alive = false;
      void enqueueEditor(element, async () => {
        await ready.catch(() => undefined);
        if (editorRef.current === instance) editorRef.current = null;
        if (!instance) return;
        const current = instance;
        instance = null;
        await current.destroy();
      });
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (disabled) editor.enableReadOnlyMode('evolvia');
    else editor.disableReadOnlyMode('evolvia');
  }, [disabled]);

  useEffect(() => {
    if (value === accepted.current) return;
    accepted.current = value;
    const editor = editorRef.current;
    if (!editor) return;
    editor.setData(markupToHtml(value));
  }, [value]);

  return <div ref={host} />;
}
