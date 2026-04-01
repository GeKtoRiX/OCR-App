import { useCallback, useRef, useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import type { ClassicEditor as ClassicEditorType } from 'ckeditor5';
import { extractContextSentence } from '../shared/lib/text-utils';
import {
  Alignment,
  Autoformat,
  AutoImage,
  AutoLink,
  AutoMediaEmbed,
  BlockQuote,
  Bold,
  ClassicEditor,
  Code,
  CodeBlock,
  Essentials,
  FindAndReplace,
  Heading,
  Highlight,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageInsert,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  Indent,
  IndentBlock,
  Italic,
  Link,
  LinkImage,
  List,
  ListProperties,
  Markdown,
  MediaEmbed,
  PageBreak,
  Paragraph,
  PasteFromOffice,
  PictureEditing,
  RemoveFormat,
  SelectAll,
  ShowBlocks,
  SourceEditing,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  TodoList,
  Underline,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';
import { OcrEditorAiPanel } from './OcrEditorAiPanel';
import './OcrEditor.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onVocabContextMenu?: (x: number, y: number, text: string, contextSentence: string) => void;
}

const editorConfig = {
  licenseKey: 'GPL',
  plugins: [
    Essentials,
    Autoformat,
    AutoImage,
    AutoLink,
    AutoMediaEmbed,
    Paragraph,
    Heading,
    // Text formatting
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Subscript,
    Superscript,
    Code,
    CodeBlock,
    Highlight,
    RemoveFormat,
    // Lists
    List,
    ListProperties,
    TodoList,
    Indent,
    IndentBlock,
    // Links & media
    Link,
    LinkImage,
    Image,
    ImageInsert,
    ImageResize,
    ImageCaption,
    ImageStyle,
    ImageToolbar,
    PictureEditing,
    MediaEmbed,
    // Tables
    Table,
    TableToolbar,
    TableCellProperties,
    TableProperties,
    TableCaption,
    TableColumnResize,
    // Blocks
    BlockQuote,
    HorizontalLine,
    Alignment,
    PageBreak,
    // Utilities
    FindAndReplace,
    SelectAll,
    ShowBlocks,
    SourceEditing,
    SpecialCharacters,
    SpecialCharactersEssentials,
    PasteFromOffice,
    // Output
    Markdown,
  ],
  toolbar: {
    items: [
      'undo',
      'redo',
      '|',
      'findAndReplace',
      'selectAll',
      '|',
      'heading',
      '|',
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'subscript',
      'superscript',
      'code',
      'highlight',
      'removeFormat',
      '|',
      'link',
      'insertImage',
      'insertTable',
      'mediaEmbed',
      'blockQuote',
      'codeBlock',
      'horizontalLine',
      'pageBreak',
      '|',
      'alignment',
      '|',
      'bulletedList',
      'numberedList',
      'todoList',
      'outdent',
      'indent',
      '|',
      'specialCharacters',
      'showBlocks',
      'sourceEditing',
    ],
    shouldNotGroupWhenFull: false,
  },
  heading: {
    options: [
      { model: 'paragraph' as const, title: 'Paragraph', class: 'ck-heading_paragraph' },
      { model: 'heading1' as const, view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
      { model: 'heading2' as const, view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
      { model: 'heading3' as const, view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
      { model: 'heading4' as const, view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
    ],
  },
  image: {
    toolbar: [
      'imageStyle:inline',
      'imageStyle:block',
      'imageStyle:wrapText',
      '|',
      'toggleImageCaption',
      'imageTextAlternative',
      '|',
      'resizeImage',
      'linkImage',
    ],
    resizeOptions: [
      { name: 'resizeImage:original', value: null, label: 'Original' },
      { name: 'resizeImage:25', value: '25', label: '25%' },
      { name: 'resizeImage:50', value: '50', label: '50%' },
      { name: 'resizeImage:75', value: '75', label: '75%' },
    ],
  },
  table: {
    contentToolbar: [
      'tableColumn',
      'tableRow',
      'mergeTableCells',
      '|',
      'tableProperties',
      'tableCellProperties',
      '|',
      'toggleTableCaption',
    ],
  },
  list: {
    properties: {
      styles: true,
      startIndex: true,
      reversed: true,
    },
  },
  link: {
    addTargetToExternalLinks: true,
    defaultProtocol: 'https://',
  },
  highlight: {
    options: [
      { model: 'yellowMarker', class: 'marker-yellow', title: 'Yellow marker', color: 'var(--ck-highlight-marker-yellow)', type: 'marker' as const },
      { model: 'greenMarker', class: 'marker-green', title: 'Green marker', color: 'var(--ck-highlight-marker-green)', type: 'marker' as const },
      { model: 'pinkMarker', class: 'marker-pink', title: 'Pink marker', color: 'var(--ck-highlight-marker-pink)', type: 'marker' as const },
      { model: 'blueMarker', class: 'marker-blue', title: 'Blue marker', color: 'var(--ck-highlight-marker-blue)', type: 'marker' as const },
    ],
  },
  mediaEmbed: {
    previewsInData: false,
  },
};

export function OcrEditor({ value, onChange, onVocabContextMenu }: Props) {
  const editorRef = useRef<ClassicEditorType | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  const handleEditorReady = useCallback((editor: ClassicEditorType) => {
    editorRef.current = editor;
    editor.model.document.on('change:data', () => {
      // keep selection text in sync
    });
    editor.model.document.selection.on('change', () => {
      const selection = editor.model.document.selection;
      if (selection.isCollapsed) {
        setSelectedText('');
        return;
      }
      const range = selection.getFirstRange();
      if (!range) {
        setSelectedText('');
        return;
      }
      const fragments: string[] = [];
      for (const item of range.getItems()) {
        if (item.is('$textProxy') || item.is('$text')) {
          fragments.push((item as { data: string }).data);
        }
      }
      setSelectedText(fragments.join(''));
    });
  }, []);

  const handleApplyToSelection = useCallback(
    (aiText: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.model.change(writer => {
        const selection = editor.model.document.selection;
        const range = selection.getFirstRange();
        if (range && !range.isCollapsed) {
          writer.remove(range);
        }
        const position = editor.model.document.selection.getFirstPosition();
        if (position) {
          writer.insertText(aiText, position);
        }
      });
      onChange(editor.getData());
    },
    [onChange],
  );

  const handleReplaceAll = useCallback(
    (aiText: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.setData(aiText);
      onChange(editor.getData());
    },
    [onChange],
  );

  const handleWrapperContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onVocabContextMenu || !selectedText.trim()) return;
      e.preventDefault();
      const markdown = editorRef.current?.getData() ?? '';
      const idx = markdown.indexOf(selectedText);
      const ctxSentence =
        idx >= 0
          ? extractContextSentence(markdown, idx, idx + selectedText.length)
          : selectedText;
      onVocabContextMenu(e.clientX, e.clientY, selectedText, ctxSentence);
    },
    [onVocabContextMenu, selectedText],
  );

  return (
    <div
      className={`ocr-editor-wrap${aiOpen ? ' ocr-editor-wrap--ai-open' : ''}`}
      onContextMenu={handleWrapperContextMenu}
    >
      <div className="ocr-editor">
        <div className="ocr-editor__ai-bar">
          <button
            className={`ocr-editor__ai-btn${aiOpen ? ' ocr-editor__ai-btn--active' : ''}`}
            onClick={() => setAiOpen(v => !v)}
            title="Toggle AI Assistant"
          >
            ✦ AI Assistant
          </button>
        </div>
        <CKEditor
          editor={ClassicEditor}
          config={editorConfig}
          data={value}
          onReady={handleEditorReady}
          onChange={(_event, editor) => {
            onChange(editor.getData());
          }}
        />
      </div>

      <OcrEditorAiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        contextText={selectedText}
        onApplyToSelection={handleApplyToSelection}
        onReplaceAll={handleReplaceAll}
      />
    </div>
  );
}
