import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { DOCUMENT_PATTERNS } from '@ocr-app/shared';
import { GatewayDocumentController } from './gateway-document.controller';

describe('GatewayDocumentController', () => {
  const mockDocument = {
    id: 'doc-1',
    markdown: '# Saved',
    filename: 'saved.md',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    analysisStatus: 'idle' as const,
    analysisError: null,
    analysisUpdatedAt: null,
  };

  let controller: GatewayDocumentController;
  let documentClient: { send: jest.Mock };

  beforeEach(() => {
    documentClient = {
      send: jest.fn().mockReturnValue(of(mockDocument)),
    };
    controller = new GatewayDocumentController(documentClient as any);
  });

  it('validates document creation payloads', async () => {
    await expect(
      controller.create({ markdown: '   ', filename: 'saved.md' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.create({ markdown: '# Saved', filename: '   ' }),
    ).rejects.toThrow(BadRequestException);

    expect(documentClient.send).not.toHaveBeenCalled();
  });

  it('forwards update requests with the route id', async () => {
    await expect(controller.update('doc-1', { markdown: '# Updated' })).resolves.toEqual(mockDocument);

    expect(documentClient.send).toHaveBeenCalledWith(DOCUMENT_PATTERNS.UPDATE, {
      id: 'doc-1',
      markdown: '# Updated',
    });
  });

  it('trims vocabulary prepare languages and preserves selected candidate ids', async () => {
    await controller.prepareVocabulary('doc-1', {
      llmReview: true,
      targetLang: ' en ',
      nativeLang: ' ru ',
      selectedCandidateIds: ['a', 'b'],
    });

    expect(documentClient.send).toHaveBeenCalledWith(
      DOCUMENT_PATTERNS.PREPARE_VOCABULARY,
      {
        id: 'doc-1',
        llmReview: true,
        targetLang: 'en',
        nativeLang: 'ru',
        selectedCandidateIds: ['a', 'b'],
      },
    );
  });

  it('validates confirm vocabulary payloads', async () => {
    await expect(
      controller.confirmVocabulary('doc-1', {
        targetLang: 'en',
        nativeLang: 'ru',
        items: undefined as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('wraps upstream errors into HTTP errors', async () => {
    documentClient.send.mockReturnValue(
      throwError(() => ({ status: 404, message: 'Document not found' })),
    );

    await expect(controller.findById('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Document not found',
    });
  });
});
