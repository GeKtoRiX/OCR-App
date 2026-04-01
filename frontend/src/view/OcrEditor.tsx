import { useCallback, useMemo, useRef, useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import type { ClassicEditor as ClassicEditorType, EditorConfig, Editor as EditorType } from 'ckeditor5';
import { extractContextSentence } from '../shared/lib/text-utils';
import {
  htmlToPlainText,
  plainTextToHtml,
  sanitizeRichTextHtml,
} from '../shared/lib/rich-text';
import {
  Alignment,
  Autoformat,
  AutoImage,
  AutoLink,
  AutoMediaEmbed,
  Autosave,
  Bookmark,
  BlockQuote,
  Bold,
  ClassicEditor,
  Code,
  CodeBlock,
  Essentials,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  GeneralHtmlSupport,
  FindAndReplace,
  Fullscreen,
  Heading,
  Highlight,
  HtmlComment,
  HtmlEmbed,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageInsert,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  IndentBlock,
  Italic,
  Link,
  LinkImage,
  List,
  ListProperties,
  MediaEmbed,
  Mention,
  PageBreak,
  Paragraph,
  PasteFromOffice,
  PictureEditing,
  RemoveFormat,
  SelectAll,
  ShowBlocks,
  SimpleUploadAdapter,
  SourceEditing,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Style,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  TextPartLanguage,
  TodoList,
  Underline,
  WordCount,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';
import { OcrEditorAiPanel } from './OcrEditorAiPanel';
import './OcrEditor.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onAutosave?: (input: { richTextHtml?: string | null }) => void;
  autosaveEnabled?: boolean;
  onVocabContextMenu?: (x: number, y: number, text: string, contextSentence: string) => void;
}

const MENTION_PEOPLE = ['@alice', '@bob', '@carol', '@dmitry', '@elena'];
const MENTION_TOPICS = ['#ocr', '#vocabulary', '#draft', '#review', '#translation'];

function sanitizeEmbeddedHtml(inputHtml: string) {
  const html = sanitizeRichTextHtml(inputHtml);
  return {
    html,
    hasChanged: html !== inputHtml,
  };
}

function createMentionFeed(items: string[]) {
  return (queryText: string) =>
    items
      .filter((item) => item.toLowerCase().includes(queryText.toLowerCase()))
      .slice(0, 8)
      .map((item) => ({ id: item, text: item }));
}

export function OcrEditor({
  value,
  onChange,
  onAutosave,
  autosaveEnabled = false,
  onVocabContextMenu,
}: Props) {
  const editorRef = useRef<ClassicEditorType | null>(null);
  const lastAutosavedHtmlRef = useRef(value);
  const wordCountRef = useRef<HTMLDivElement>(null);
  const onAutosaveRef = useRef(onAutosave);
  onAutosaveRef.current = onAutosave;
  const autosaveEnabledRef = useRef(autosaveEnabled);
  autosaveEnabledRef.current = autosaveEnabled;
  const [selectedText, setSelectedText] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  const editorConfig = useMemo(() => ({
    licenseKey: 'GPL',
    plugins: [
      Essentials,
      Paragraph,
      Heading,
      Autoformat,
      AutoLink,
      Autosave,
      Bookmark,
      FindAndReplace,
      Fullscreen,
      SelectAll,
      ShowBlocks,
      SourceEditing,
      PasteFromOffice,
      SpecialCharacters,
      SpecialCharactersEssentials,
      Mention,
      WordCount,
      Bold,
      Italic,
      Underline,
      Strikethrough,
      Subscript,
      Superscript,
      Code,
      CodeBlock,
      RemoveFormat,
      Highlight,
      FontSize,
      FontFamily,
      FontColor,
      FontBackgroundColor,
      BlockQuote,
      HorizontalLine,
      PageBreak,
      Alignment,
      Style,
      List,
      ListProperties,
      TodoList,
      Indent,
      IndentBlock,
      Link,
      LinkImage,
      MediaEmbed,
      AutoMediaEmbed,
      Image,
      ImageUpload,
      AutoImage,
      ImageInsert,
      ImageResize,
      ImageStyle,
      ImageCaption,
      ImageToolbar,
      PictureEditing,
      SimpleUploadAdapter,
      Table,
      TableToolbar,
      TableCaption,
      TableColumnResize,
      TableCellProperties,
      TableProperties,
      TextPartLanguage,
      GeneralHtmlSupport,
      HtmlEmbed,
      HtmlComment,
    ],
    toolbar: {
      items: [
        'undo',
        'redo',
        '|',
        'findAndReplace',
        'selectAll',
        'showBlocks',
        'sourceEditing',
        '|',
        'link',
        'bookmark',
        'insertImage',
        'insertTable',
        'blockQuote',
        'mediaEmbed',
        'codeBlock',
        'pageBreak',
        'horizontalLine',
        'htmlEmbed',
        'specialCharacters',
        '-',
        'heading',
        'style',
        '|',
        'bold',
        'italic',
        'underline',
        'strikethrough',
        {
          label: 'Basic styles',
          icon: 'text',
          items: [
            'fontSize',
            'fontFamily',
            'fontColor',
            'fontBackgroundColor',
            'highlight',
            'superscript',
            'subscript',
            'code',
            '|',
            'textPartLanguage',
          ],
        },
        'removeFormat',
        '|',
        'alignment',
        '|',
        'bulletedList',
        'numberedList',
        'todoList',
        'outdent',
        'indent',
        '|',
        'fullscreen',
      ],
      shouldNotGroupWhenFull: true,
    },
    menuBar: {
      isVisible: true,
    },
    autosave: {
      waitingTime: 1200,
      save(editor: EditorType) {
        const nextHtml = editor.getData();
        if (!autosaveEnabledRef.current || !onAutosaveRef.current || nextHtml === lastAutosavedHtmlRef.current) {
          return Promise.resolve();
        }
        lastAutosavedHtmlRef.current = nextHtml;
        onAutosaveRef.current({ richTextHtml: nextHtml });
        return Promise.resolve();
      },
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
    style: {
      definitions: [
        {
          name: 'Lead paragraph',
          element: 'p',
          classes: ['ck-style-lead'],
        },
        {
          name: 'Info box',
          element: 'blockquote',
          classes: ['ck-style-info-box'],
        },
        {
          name: 'Inline label',
          element: 'span',
          classes: ['ck-style-inline-label'],
        },
      ],
    },
    fontSize: {
      options: [10, 11, 12, 'default', 14, 16, 18, 20, 24, 28, 32],
      supportAllValues: true,
    },
    fontFamily: {
      supportAllValues: true,
    },
    fontColor: {
      columns: 6,
      documentColors: 10,
    },
    fontBackgroundColor: {
      columns: 6,
      documentColors: 10,
    },
    image: {
      insert: {
        type: 'auto',
      },
      toolbar: [
        'imageStyle:inline',
        'imageStyle:block',
        'imageStyle:side',
        '|',
        'toggleImageCaption',
        'imageTextAlternative',
        '|',
        'resizeImage:25',
        'resizeImage:50',
        'resizeImage:75',
        'resizeImage:original',
        '|',
        'linkImage',
      ],
      resizeOptions: [
        { name: 'resizeImage:original', value: null, label: 'Original' },
        { name: 'resizeImage:25', value: '25', label: '25%' },
        { name: 'resizeImage:50', value: '50', label: '50%' },
        { name: 'resizeImage:75', value: '75', label: '75%' },
      ],
    },
    simpleUpload: {
      uploadUrl: '/api/editor/uploads/images',
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
      decorators: {
        openInNewTab: {
          mode: 'manual' as const,
          label: 'Open in new tab',
          defaultValue: true,
          attributes: {
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        },
      },
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
      previewsInData: true,
    },
    mention: {
      feeds: [
        {
          marker: '@',
          feed: createMentionFeed(MENTION_PEOPLE),
          minimumCharacters: 0,
        },
        {
          marker: '#',
          feed: createMentionFeed(MENTION_TOPICS),
          minimumCharacters: 0,
        },
      ],
    },
    htmlSupport: {
      allow: [
        {
          name: /.*/,
          attributes: true,
          classes: true,
          styles: true,
        },
      ],
    },
    htmlEmbed: {
      showPreviews: true,
      sanitizeHtml: sanitizeEmbeddedHtml,
    },
  }) satisfies EditorConfig, []);

  const handleEditorReady = useCallback((editor: ClassicEditorType) => {
    editorRef.current = editor;
    lastAutosavedHtmlRef.current = editor.getData();

    const wordCountPlugin = editor.plugins.get('WordCount') as {
      wordCountContainer: HTMLElement;
    };
    if (wordCountRef.current) {
      wordCountRef.current.innerHTML = '';
      wordCountRef.current.appendChild(wordCountPlugin.wordCountContainer);
    }

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
      const viewFragment = editor.data.processor.toView(plainTextToHtml(aiText));
      const modelFragment = editor.data.toModel(viewFragment);

      editor.model.change(writer => {
        const selection = editor.model.document.selection;
        const range = selection.getFirstRange();
        if (range && !range.isCollapsed) {
          writer.remove(range);
        }
        editor.model.insertContent(modelFragment, selection);
      });
    },
    [],
  );

  const handleReplaceAll = useCallback(
    (aiText: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.setData(plainTextToHtml(aiText));
    },
    [],
  );

  const handleWrapperContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onVocabContextMenu || !selectedText.trim()) return;
      e.preventDefault();
      const plainText = htmlToPlainText(editorRef.current?.getData() ?? '');
      const idx = plainText.indexOf(selectedText);
      const ctxSentence =
        idx >= 0
          ? extractContextSentence(plainText, idx, idx + selectedText.length)
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
      <div className="ocr-editor" data-testid="result-editor">
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
        <div className="ocr-editor__status" ref={wordCountRef} />
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
