import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrEditor } from './OcrEditor';

const ckState = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const selectionListeners = new Set<() => void>();
  const state = {
    data: '',
    selectedText: '',
    selectedStart: 0,
    selectedEnd: 0,
    triggerSelection(text: string) {
      state.selectedText = text;
      state.selectedStart = state.data.indexOf(text);
      state.selectedEnd = state.selectedStart >= 0 ? state.selectedStart + text.length : 0;
      selectionListeners.forEach((listener) => listener());
    },
    editor: {
      getData: () => state.data,
      setData: (next: string) => {
        state.data = next;
        listeners.forEach((listener) => listener());
      },
      model: {
        document: {
          on: (event: string, callback: () => void) => {
            if (event === 'change:data') listeners.add(callback);
          },
          selection: {
            on: (_event: string, callback: () => void) => {
              selectionListeners.add(callback);
            },
            get isCollapsed() {
              return !state.selectedText;
            },
            getFirstRange: () => {
              if (!state.selectedText || state.selectedStart < 0) return null;
              return {
                isCollapsed: false,
                start: state.selectedStart,
                end: state.selectedEnd,
                getItems: () => [{ is: (kind: string) => kind === '$textProxy', data: state.selectedText }],
              };
            },
            getFirstPosition: () => {
              if (state.selectedStart < 0) return null;
              return { offset: state.selectedStart };
            },
          },
        },
        change: (callback: (writer: { remove: (range: { start: number; end: number }) => void; insertText: (text: string, position: { offset: number }) => void }) => void) => {
          callback({
            remove: (range) => {
              state.data = state.data.slice(0, range.start) + state.data.slice(range.end);
            },
            insertText: (text, position) => {
              state.data =
                state.data.slice(0, position.offset) +
                text +
                state.data.slice(position.offset);
              state.selectedText = '';
            },
          });
          listeners.forEach((listener) => listener());
        },
      },
    },
    reset() {
      state.data = '';
      state.selectedText = '';
      state.selectedStart = 0;
      state.selectedEnd = 0;
      listeners.clear();
      selectionListeners.clear();
    },
  };

  return state;
});

vi.mock('ckeditor5', () => {
  const stub = () => class {};
  return {
    Alignment: stub(), Autoformat: stub(), AutoImage: stub(), AutoLink: stub(),
    AutoMediaEmbed: stub(), BlockQuote: stub(), Bold: stub(),
    ClassicEditor: stub(), Code: stub(), CodeBlock: stub(),
    Essentials: stub(), FindAndReplace: stub(), Heading: stub(),
    Highlight: stub(), HorizontalLine: stub(),
    Image: stub(), ImageCaption: stub(), ImageInsert: stub(),
    ImageResize: stub(), ImageStyle: stub(), ImageToolbar: stub(),
    Indent: stub(), IndentBlock: stub(), Italic: stub(),
    Link: stub(), LinkImage: stub(), List: stub(), ListProperties: stub(),
    Markdown: stub(), MediaEmbed: stub(), PageBreak: stub(), Paragraph: stub(),
    PasteFromOffice: stub(), PictureEditing: stub(), RemoveFormat: stub(),
    SelectAll: stub(), ShowBlocks: stub(), SourceEditing: stub(),
    SpecialCharacters: stub(), SpecialCharactersEssentials: stub(),
    Strikethrough: stub(), Subscript: stub(), Superscript: stub(),
    Table: stub(), TableCaption: stub(), TableCellProperties: stub(),
    TableColumnResize: stub(), TableProperties: stub(), TableToolbar: stub(),
    TodoList: stub(), Underline: stub(),
  };
});

vi.mock('@ckeditor/ckeditor5-react', () => ({
  CKEditor: ({
    data,
    onReady,
    onChange,
  }: {
    data: string;
    onReady: (editor: typeof ckState.editor) => void;
    onChange: (event: unknown, editor: typeof ckState.editor) => void;
  }) => {
    ckState.data = data;
    onReady(ckState.editor);

    return (
      <div>
        <textarea
          data-testid="ckeditor-input"
          value={ckState.data}
          onChange={(event) => {
            ckState.editor.setData(event.target.value);
            onChange({}, ckState.editor);
          }}
        />
        <button
          type="button"
          data-testid="ckeditor-select-alpha"
          onClick={() => ckState.triggerSelection('Alpha')}
        >
          Select Alpha
        </button>
      </div>
    );
  },
}));

vi.mock('./OcrEditorAiPanel', () => ({
  OcrEditorAiPanel: ({
    open,
    onApplyToSelection,
    onReplaceAll,
  }: {
    open: boolean;
    onApplyToSelection: (text: string) => void;
    onReplaceAll: (text: string) => void;
  }) =>
    open ? (
      <div data-testid="ai-panel">
        <button type="button" onClick={() => onApplyToSelection('AI refined')}>
          Apply Selection
        </button>
        <button type="button" onClick={() => onReplaceAll('# Replaced')}>
          Replace All
        </button>
      </div>
    ) : null,
}));

describe('OcrEditor', () => {
  beforeEach(() => {
    ckState.reset();
  });

  it('opens the AI panel and replaces the whole document', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<OcrEditor value="# Original" onChange={onChange} />);

    await user.click(screen.getByTitle('Toggle AI Assistant'));
    expect(screen.getByTestId('ai-panel')).toBeInTheDocument();

    await user.click(screen.getByText('Replace All'));

    expect(onChange).toHaveBeenLastCalledWith('# Replaced');
  });

  it('replaces only the selected text when AI applies to selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<OcrEditor value="Alpha beta." onChange={onChange} />);

    await user.click(screen.getByTestId('ckeditor-select-alpha'));
    await user.click(screen.getByTitle('Toggle AI Assistant'));
    await user.click(screen.getByText('Apply Selection'));

    expect(onChange).toHaveBeenLastCalledWith('AI refined beta.');
  });

  it('triggers vocabulary context menu from editor selection with context sentence', async () => {
    const user = userEvent.setup();
    const onVocabContextMenu = vi.fn();

    render(
      <OcrEditor
        value="Alpha beta. Another sentence."
        onChange={vi.fn()}
        onVocabContextMenu={onVocabContextMenu}
      />,
    );

    await user.click(screen.getByTestId('ckeditor-select-alpha'));
    fireEvent.contextMenu(screen.getByText('Select Alpha').parentElement!.parentElement!, {
      clientX: 80,
      clientY: 120,
    });

    expect(onVocabContextMenu).toHaveBeenCalledWith(
      80,
      120,
      'Alpha',
      'Alpha beta.',
    );
  });
});
