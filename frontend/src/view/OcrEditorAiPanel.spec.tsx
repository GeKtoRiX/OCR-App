import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrEditorAiPanel } from './OcrEditorAiPanel';

const copyToClipboardSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../shared/lib/clipboard', () => ({
  copyToClipboard: copyToClipboardSpy,
}));

function makeSseResponse(chunks: string[], delays: number[] = []): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }

      const chunk = chunks[index++];
      const delay = delays[index - 1] ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      controller.enqueue(encoder.encode(chunk));
    },
  });

  return new Response(body, { status: 200 });
}

describe('OcrEditorAiPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    copyToClipboardSpy.mockClear();
  });

  it('streams AI text and applies it to the selection', async () => {
    const user = userEvent.setup();
    const onApplyToSelection = vi.fn();
    const onReplaceAll = vi.fn();
    vi.mocked(global.fetch).mockResolvedValue(
      makeSseResponse([
        'data: {"text":"Improved"}\n',
        'data: {"text":" text"}\n',
        'data: [DONE]\n\n',
      ]),
    );

    render(
      <OcrEditorAiPanel
        open
        onClose={vi.fn()}
        contextText="Original text"
        onApplyToSelection={onApplyToSelection}
        onReplaceAll={onReplaceAll}
      />,
    );

    await user.click(screen.getByText('Improve writing'));

    await screen.findByText('Improved text');
    await user.click(screen.getByText('Replace selection'));

    expect(onApplyToSelection).toHaveBeenCalledWith('Improved text');
    expect(onReplaceAll).not.toHaveBeenCalled();
  });

  it('copies, replaces all, and discards the streamed response', async () => {
    const user = userEvent.setup();
    const onReplaceAll = vi.fn();
    vi.mocked(global.fetch).mockResolvedValue(
      makeSseResponse([
        'data: {"text":"Short"}\n',
        'data: {"text":" answer"}\n',
        'data: [DONE]\n\n',
      ]),
    );

    render(
      <OcrEditorAiPanel
        open
        onClose={vi.fn()}
        contextText=""
        onApplyToSelection={vi.fn()}
        onReplaceAll={onReplaceAll}
      />,
    );

    await user.type(screen.getByPlaceholderText('Type your prompt…'), 'Rewrite this');
    await user.click(screen.getByTitle('Send (Ctrl+Enter)'));

    await screen.findByText('Short answer');
    await user.click(screen.getByText('Copy'));
    await waitFor(() => {
      expect(copyToClipboardSpy).toHaveBeenCalledWith('Short answer');
    });

    await user.click(screen.getByText('Replace all'));
    expect(onReplaceAll).toHaveBeenCalledWith('Short answer');

    await user.click(screen.getByText('Discard'));
    await waitFor(() => {
      expect(screen.queryByText('Short answer')).not.toBeInTheDocument();
    });
  });

  it('shows streamed SSE errors', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      makeSseResponse([
        'data: {"error":"LM Studio unavailable"}\n\n',
      ]),
    );

    render(
      <OcrEditorAiPanel
        open
        onClose={vi.fn()}
        contextText="Original text"
        onApplyToSelection={vi.fn()}
        onReplaceAll={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Fix grammar'));

    expect(await screen.findByText('LM Studio unavailable')).toBeInTheDocument();
  });

  it('stops streaming when requested', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      makeSseResponse(
        [
          'data: {"text":"First"}\n',
          'data: {"text":" second"}\n',
          'data: [DONE]\n\n',
        ],
        [0, 25, 0],
      ),
    );

    render(
      <OcrEditorAiPanel
        open
        onClose={vi.fn()}
        contextText="Original text"
        onApplyToSelection={vi.fn()}
        onReplaceAll={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Summarize'));
    const stopButton = await screen.findByText('■ Stop');
    await screen.findByText('First');
    fireEvent.click(stopButton);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.queryByText('First second')).not.toBeInTheDocument();
  });
});
