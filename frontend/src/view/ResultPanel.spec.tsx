import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultPanel } from './ResultPanel';

vi.mock('../shared/lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock('../shared/api', () => ({
  generateSpeech: vi.fn(),
}));

vi.mock('ckeditor5', () => {
  const stub = () => class {};
  return {
    Alignment: stub(), Autoformat: stub(), AutoImage: stub(), AutoLink: stub(),
    AutoMediaEmbed: stub(), Autosave: stub(), BlockQuote: stub(), Bold: stub(),
    Bookmark: stub(), ClassicEditor: stub(), Code: stub(), CodeBlock: stub(), Essentials: stub(),
    FindAndReplace: stub(), FontBackgroundColor: stub(), FontColor: stub(),
    FontFamily: stub(), FontSize: stub(), Fullscreen: stub(), GeneralHtmlSupport: stub(), Heading: stub(),
    Highlight: stub(), HorizontalLine: stub(), HtmlComment: stub(), HtmlEmbed: stub(),
    Image: stub(), ImageCaption: stub(), ImageInsert: stub(), ImageResize: stub(),
    ImageStyle: stub(), ImageToolbar: stub(), ImageUpload: stub(), Indent: stub(),
    IndentBlock: stub(), Italic: stub(), Link: stub(), LinkImage: stub(),
    List: stub(), ListProperties: stub(), MediaEmbed: stub(), Mention: stub(),
    PageBreak: stub(), Paragraph: stub(), PasteFromOffice: stub(), PictureEditing: stub(),
    RemoveFormat: stub(), SelectAll: stub(), ShowBlocks: stub(), SimpleUploadAdapter: stub(),
    SourceEditing: stub(), SpecialCharacters: stub(), SpecialCharactersEssentials: stub(),
    Strikethrough: stub(), Style: stub(), Subscript: stub(), Superscript: stub(),
    Table: stub(), TableCaption: stub(), TableCellProperties: stub(), TableColumnResize: stub(),
    TableProperties: stub(), TableToolbar: stub(), TextPartLanguage: stub(), TodoList: stub(), Underline: stub(),
    WordCount: stub(),
  };
});

vi.mock('@ckeditor/ckeditor5-react', () => ({
  CKEditor: ({
    data,
    onChange,
  }: {
    data: string;
    onChange: (e: unknown, ed: { getData: () => string }) => void;
  }) => (
    <textarea
      data-testid="result-editor"
      value={data}
      onChange={e => onChange({}, { getData: () => e.target.value })}
    />
  ),
}));

import { copyToClipboard } from '../shared/lib/clipboard';
import { generateSpeech } from '../shared/api';

const mockCopy = vi.mocked(copyToClipboard);
const mockGenerateSpeech = vi.mocked(generateSpeech);

describe('ResultPanel', () => {
  const result = {
    rawText: 'Raw text content',
    markdown: '# Markdown content',
    richTextHtml: null,
    filename: 'test.png',
  };

  beforeEach(() => {
    mockCopy.mockClear();
    mockGenerateSpeech.mockReset();
    global.URL.createObjectURL = vi.fn(() => 'blob:audio-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should show markdown tab content by default', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText('Markdown content')).toBeInTheDocument();
  });

  it('should switch to raw text tab', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('Raw Text'));

    expect(screen.getByText('Raw text content')).toBeInTheDocument();
  });

  it('should copy markdown to clipboard', () => {
    render(<ResultPanel result={result} />);
    fireEvent.click(screen.getByText('Copy'));

    expect(mockCopy).toHaveBeenCalledWith('Markdown content');
  });

  it('should copy raw text when on raw tab', () => {
    render(<ResultPanel result={result} />);
    fireEvent.click(screen.getByText('Raw Text'));
    fireEvent.click(screen.getByText('Copy'));

    expect(mockCopy).toHaveBeenCalledWith('Raw text content');
  });

  it('should render tab buttons and filename', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText('Formatted')).toBeInTheDocument();
    expect(screen.getByText('Raw Text')).toBeInTheDocument();
    expect(screen.getByText('test.png')).toBeInTheDocument();
  });

  it('should show char counts for raw and markdown', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText(/Raw:/)).toBeInTheDocument();
    expect(screen.getByText(/Formatted:/)).toBeInTheDocument();
  });

  it('should enter edit mode and show textarea', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('Edit'));

    expect(await screen.findByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('should show TTS panel when TTS button is clicked', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('🔊 TTS'));

    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('should reset to original content when result prop changes', () => {
    const { rerender } = render(<ResultPanel result={result} />);

    rerender(<ResultPanel result={{ rawText: 'New raw', markdown: '# New', richTextHtml: null, filename: 'new.png' }} />);

    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('should render save button when onSave is provided', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="idle" />);

    expect(screen.getByText('Save Document')).toBeInTheDocument();
  });

  it('should call onSave with rich text HTML when save button is clicked', () => {
    const onSave = vi.fn();
    render(<ResultPanel result={result} onSave={onSave} saveStatus="idle" />);

    fireEvent.click(screen.getByText('Save Document'));

    expect(onSave).toHaveBeenCalledWith({
      richTextHtml: '<h1>Markdown content</h1>',
    });
  });

  it('should show "Saved ✓" when saveStatus is saved', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="saved" />);

    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
  });

  it('should not show save button when isSavedDocument is true', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="idle" isSavedDocument />);

    expect(screen.queryByText('Save Document')).not.toBeInTheDocument();
  });

  it('should hide Raw Text tab when isSavedDocument is true', () => {
    render(<ResultPanel result={result} isSavedDocument />);

    expect(screen.queryByText('Raw Text')).not.toBeInTheDocument();
  });

  it('should update a saved document with edited rich text HTML', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <ResultPanel
        result={result}
        isSavedDocument
        onUpdate={onUpdate}
      />,
    );

    await user.click(screen.getByText('Edit'));
    const editor = await screen.findByRole('textbox');
    await user.clear(editor);
    await user.type(editor, '<p>Updated markdown</p>');
    await user.click(screen.getByTitle('Update saved document'));

    expect(onUpdate).toHaveBeenCalledWith({
      richTextHtml: '<p>Updated markdown</p>',
    });
  });

  it('should not allow adding vocabulary in edit mode', async () => {
    const user = userEvent.setup();
    const onAddVocabulary = vi.fn();
    render(
      <ResultPanel
        result={result}
        existingWordsSet={new Set<string>()}
        onAddVocabulary={onAddVocabulary}
      />,
    );

    await user.click(screen.getByText('Edit'));
    const editor = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    const start = result.markdown.indexOf('Markdown');
    const end = start + 'Markdown'.length;
    editor.setSelectionRange(start, end);

    fireEvent.contextMenu(editor, { clientX: 40, clientY: 60 });
    expect(screen.queryByText('Word')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Translation...')).not.toBeInTheDocument();
    expect(onAddVocabulary).not.toHaveBeenCalled();
  });

  it('should allow adding vocabulary from the rendered result without entering edit mode', async () => {
    const user = userEvent.setup();
    const onAddVocabulary = vi.fn();
    render(
      <ResultPanel
        result={result}
        existingWordsSet={new Set<string>()}
        onAddVocabulary={onAddVocabulary}
      />,
    );

    const content = screen.getByTestId('result-content');
    const textNode = content.querySelector('h1')?.firstChild;
    expect(textNode).not.toBeNull();

    const start = 'Markdown content'.indexOf('Markdown');
    const end = start + 'Markdown'.length;
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode!, start);
    range.setEnd(textNode!, end);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseDown(content, { button: 2 });
    fireEvent.contextMenu(content, { clientX: 40, clientY: 60 });
    await user.click(screen.getByText('Add to Vocabulary'));
    await user.type(screen.getByPlaceholderText('Translation...'), 'перевод');
    await user.click(screen.getByText('Add'));

    expect(onAddVocabulary).toHaveBeenCalledWith(
      'Markdown',
      'word',
      'перевод',
      'Markdown content',
      null,
    );
  });

  it('should keep the selected text for right click even if the browser collapses the selection', async () => {
    const user = userEvent.setup();
    const onAddVocabulary = vi.fn();
    render(
      <ResultPanel
        result={result}
        existingWordsSet={new Set<string>()}
        onAddVocabulary={onAddVocabulary}
      />,
    );

    const content = screen.getByTestId('result-content');
    const textNode = content.querySelector('h1')?.firstChild;
    expect(textNode).not.toBeNull();
    const start = 'Markdown content'.indexOf('Markdown');
    const end = start + 'Markdown'.length;

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode!, start);
    range.setEnd(textNode!, end);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseDown(content, { button: 2 });
    selection?.removeAllRanges();

    fireEvent.contextMenu(content, { clientX: 40, clientY: 60 });
    await user.click(screen.getByText('Add to Vocabulary'));
    await user.type(screen.getByPlaceholderText('Translation...'), 'перевод');
    await user.click(screen.getByText('Add'));

    expect(onAddVocabulary).toHaveBeenCalledWith(
      'Markdown',
      'word',
      'перевод',
      'Markdown content',
      null,
    );
  });

  it('should toggle all TTS engine controls and generate audio output', async () => {
    const user = userEvent.setup();
    mockGenerateSpeech.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('🔊 TTS'));
    await user.click(screen.getByText('Fable'));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1.15' } });
    await user.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(mockGenerateSpeech).toHaveBeenCalled();
    });
    expect(await screen.findByTitle('Download WAV')).toBeInTheDocument();
    expect(mockGenerateSpeech).toHaveBeenCalledWith(
      'Markdown content',
      expect.objectContaining({
        engine: 'kokoro',
        voice: 'bm_fable',
        speed: 1.15,
      }),
    );

    await user.click(screen.getByText('1.5×'));

    const rateButton = screen.getByText('1.5×');
    expect(rateButton).toHaveClass('tts-panel__rate-btn--active');
  });
});
