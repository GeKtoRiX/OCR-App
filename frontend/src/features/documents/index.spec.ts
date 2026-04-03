import { describe, expect, it } from 'vitest';
import { useDocumentsStore } from './documents.store';
import * as documents from './index';

describe('documents index', () => {
  it('re-exports the documents store hook', () => {
    expect(documents.useDocumentsStore).toBe(useDocumentsStore);
  });
});
