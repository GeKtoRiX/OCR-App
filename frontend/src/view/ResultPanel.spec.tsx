import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultPanel } from './ResultPanel';

vi.mock('../model/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock('../model/api', () => ({
  generateSpeech: vi.fn(),
}));

import { copyToClipboard } from '../model/clipboard';
import { generateSpeech } from '../model/api';

const mockCopy = vi.mocked(copyToClipboard);
const mockGenerateSpeech = vi.mocked(generateSpeech);

describe('ResultPanel', () => {
  const result = {
    rawText: 'Raw text content',
    markdown: '# Markdown content',
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

    expect(screen.getByText('# Markdown content')).toBeInTheDocument();
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

    expect(mockCopy).toHaveBeenCalledWith('# Markdown content');
  });

  it('should copy raw text when on raw tab', () => {
    render(<ResultPanel result={result} />);
    fireEvent.click(screen.getByText('Raw Text'));
    fireEvent.click(screen.getByText('Copy'));

    expect(mockCopy).toHaveBeenCalledWith('Raw text content');
  });

  it('should render tab buttons and filename', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText('Markdown')).toBeInTheDocument();
    expect(screen.getByText('Raw Text')).toBeInTheDocument();
    expect(screen.getByText('test.png')).toBeInTheDocument();
  });

  it('should show char counts for raw and markdown', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText(/Raw:/)).toBeInTheDocument();
    expect(screen.getByText(/Markdown:/)).toBeInTheDocument();
  });

  it('should enter edit mode and show textarea', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('Edit'));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('should show TTS panel when TTS button is clicked', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('🔊 TTS'));

    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('should expose f5 as a TTS engine option', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('🔊 TTS'));
    // "F5" matches both the engine button and the supertone voice chip "F5";
    // target the engine button specifically.
    const engineBtn = screen.getAllByText('F5').find(el => el.classList.contains('tts-panel__engine-btn'))!;
    await user.click(engineBtn);

    expect(screen.getByLabelText('Reference Audio')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter the transcript of the reference audio')).toBeInTheDocument();
  });

  it('should reset to original content when result prop changes', () => {
    const { rerender } = render(<ResultPanel result={result} />);

    rerender(<ResultPanel result={{ rawText: 'New raw', markdown: '# New', filename: 'new.png' }} />);

    expect(screen.getByText('# New')).toBeInTheDocument();
  });

  it('should render save button when onSave is provided', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="idle" />);

    expect(screen.getByTitle('Save to database')).toBeInTheDocument();
  });

  it('should call onSave with markdown content when save button is clicked', () => {
    const onSave = vi.fn();
    render(<ResultPanel result={result} onSave={onSave} saveStatus="idle" />);

    fireEvent.click(screen.getByTitle('Save to database'));

    expect(onSave).toHaveBeenCalledWith('# Markdown content');
  });

  it('should show "Saved ✓" when saveStatus is saved', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="saved" />);

    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
  });

  it('should not show save button when isSavedDocument is true', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="idle" isSavedDocument />);

    expect(screen.queryByTitle('Save to database')).not.toBeInTheDocument();
  });

  it('should hide Raw Text tab when isSavedDocument is true', () => {
    render(<ResultPanel result={result} isSavedDocument />);

    expect(screen.queryByText('Raw Text')).not.toBeInTheDocument();
  });

  it('should update a saved document with edited markdown', async () => {
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
    const editor = screen.getByRole('textbox');
    await user.clear(editor);
    await user.type(editor, '# Updated markdown');
    await user.click(screen.getByTitle('Update saved document'));

    expect(onUpdate).toHaveBeenCalledWith('# Updated markdown');
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
    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;
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
    const textNode = content.firstChild;
    expect(textNode).not.toBeNull();

    const start = result.markdown.indexOf('Markdown');
    const end = start + 'Markdown'.length;
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode!, start);
    range.setEnd(textNode!, end);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseDown(content, { button: 2 });
    fireEvent.contextMenu(content, { clientX: 40, clientY: 60 });
    await user.click(screen.getByText('Word'));
    await user.type(screen.getByPlaceholderText('Translation...'), 'перевод');
    await user.click(screen.getByText('Add'));

    expect(onAddVocabulary).toHaveBeenCalledWith(
      'Markdown',
      'word',
      'перевод',
      '# Markdown content',
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
    const textNode = content.firstChild;
    expect(textNode).not.toBeNull();
    const start = result.markdown.indexOf('Markdown');
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
    await user.click(screen.getByText('Word'));
    await user.type(screen.getByPlaceholderText('Translation...'), 'перевод');
    await user.click(screen.getByText('Add'));

    expect(onAddVocabulary).toHaveBeenCalledWith(
      'Markdown',
      'word',
      'перевод',
      '# Markdown content',
    );
  });

  it('should toggle all TTS engine controls and generate audio output', async () => {
    const user = userEvent.setup();
    mockGenerateSpeech.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('🔊 TTS'));

    await user.click(screen.getByText('ES'));
    await user.click(screen.getByText('F2'));
    const supertoneSliders = screen.getAllByRole('slider');
    fireEvent.change(supertoneSliders[0], { target: { value: '1.35' } });
    fireEvent.change(supertoneSliders[1], { target: { value: '8' } });

    await user.click(screen.getByText('Piper'));
    await user.click(screen.getByText('Amy'));
    await user.clear(screen.getByPlaceholderText('e.g. en_US-amy-medium'));
    await user.type(screen.getByPlaceholderText('e.g. en_US-amy-medium'), 'en_US-lessac-high');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1.2' } });

    await user.click(screen.getByText('Kokoro'));
    await user.click(screen.getByText('Fable'));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1.15' } });

    const engineBtn = screen.getAllByText('F5').find(el => el.classList.contains('tts-panel__engine-btn'))!;
    await user.click(engineBtn);
    const fileInput = screen.getByLabelText('Reference Audio');
    const file = new File(['wav'], 'reference.wav', { type: 'audio/wav' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await user.type(screen.getByPlaceholderText('Enter the transcript of the reference audio'), 'Reference transcript');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    expect(screen.getByPlaceholderText('Reference text will be detected from the uploaded audio')).toBeDisabled();
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    await user.click(screen.getByText('Supertone'));
    await user.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(mockGenerateSpeech).toHaveBeenCalled();
    });
    expect(await screen.findByTitle('Download WAV')).toBeInTheDocument();

    await user.click(screen.getByText('1.5×'));

    const rateButton = screen.getByText('1.5×');
    expect(rateButton).toHaveClass('tts-panel__rate-btn--active');
  });
});
