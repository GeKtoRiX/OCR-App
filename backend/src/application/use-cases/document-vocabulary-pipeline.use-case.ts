import { Injectable } from '@nestjs/common';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
import { IDocumentVocabularyExtractor } from '../../domain/ports/document-vocabulary-extractor.port';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';
import {
  SavedDocumentOutput,
  PrepareDocumentVocabularyInput,
  PreparedDocumentVocabularyOutput,
  ConfirmDocumentVocabularyInput,
  ConfirmDocumentVocabularyOutput,
  DocumentVocabCandidateOutput,
} from '../dto/saved-document.dto';
import { SavedDocument } from '../../domain/entities/saved-document.entity';

@Injectable()
export class DocumentVocabularyPipelineUseCase {
  constructor(
    private readonly repository: ISavedDocumentRepository,
    private readonly vocabularyRepository: IVocabularyRepository,
    private readonly vocabularyLlmService: IVocabularyLlmService,
    private readonly vocabularyExtractor: IDocumentVocabularyExtractor,
  ) {}

  private toOutput(doc: SavedDocument): SavedDocumentOutput {
    return {
      id: doc.id,
      markdown: doc.markdown,
      richTextHtml: doc.richTextHtml,
      filename: doc.filename,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      analysisStatus: doc.analysisStatus,
      analysisError: doc.analysisError,
      analysisUpdatedAt: doc.analysisUpdatedAt,
    };
  }

  private toCandidateOutput(candidate: DocumentVocabCandidate): DocumentVocabCandidateOutput {
    return {
      id: candidate.id,
      surface: candidate.surface,
      normalized: candidate.normalized,
      lemma: candidate.lemma,
      vocabType: candidate.vocabType,
      pos: candidate.pos,
      translation: candidate.translation,
      contextSentence: candidate.contextSentence,
      sentenceIndex: candidate.sentenceIndex,
      startOffset: candidate.startOffset,
      endOffset: candidate.endOffset,
      selectedByDefault: candidate.selectedByDefault,
      isDuplicate: candidate.isDuplicate,
      reviewSource: candidate.reviewSource,
    };
  }

  async prepareVocabulary(
    id: string,
    input: PrepareDocumentVocabularyInput,
  ): Promise<PreparedDocumentVocabularyOutput | null> {
    const doc = await this.repository.findById(id);
    if (!doc) {
      return null;
    }

    await this.repository.updateAnalysisStatus(id, 'pending', null);

    try {
      let candidatesWithDuplicateState: DocumentVocabCandidate[];

      if (input.llmReview && input.selectedCandidateIds && input.selectedCandidateIds.length > 0) {
        // LLM-only pass: load stored candidates, enrich only selected ones
        const storedCandidates = await this.repository.findVocabularyCandidates(id);
        const selectedSet = new Set(input.selectedCandidateIds);
        const selectedCandidates = storedCandidates.filter((c) => selectedSet.has(c.id));

        const enrichedSelected = await this.vocabularyLlmService.enrichDocumentCandidates({
          markdown: doc.markdown,
          candidates: selectedCandidates,
          targetLang: input.targetLang,
          nativeLang: input.nativeLang,
          llmReview: true,
        });

        const enrichedWithDuplicates = await Promise.all(
          enrichedSelected.map(async (candidate: DocumentVocabCandidate) => {
            const existing = await this.vocabularyRepository.findByWord(
              candidate.normalized,
              input.targetLang,
              input.nativeLang,
            );
            return new DocumentVocabCandidate(
              candidate.id,
              candidate.documentId,
              candidate.surface,
              candidate.normalized,
              candidate.lemma,
              candidate.vocabType,
              candidate.pos,
              candidate.translation,
              candidate.contextSentence,
              candidate.sentenceIndex,
              candidate.startOffset,
              candidate.endOffset,
              candidate.selectedByDefault,
              Boolean(existing),
              candidate.reviewSource,
            );
          }),
        );

        const enrichedById = new Map(enrichedWithDuplicates.map((c) => [c.id, c]));
        const originalIds = new Set(storedCandidates.map((c) => c.id));
        const llmAdded = enrichedWithDuplicates.filter((c) => !originalIds.has(c.id));
        // Replace selected with enriched version, keep unselected as-is, append any LLM-added
        candidatesWithDuplicateState = [
          ...storedCandidates.map((c) => enrichedById.get(c.id) ?? c),
          ...llmAdded,
        ];
      } else {
        const extractedCandidates = await this.vocabularyExtractor.extract({
          documentId: id,
          markdown: doc.markdown,
          targetLang: input.targetLang,
          nativeLang: input.nativeLang,
        });

        const enrichedCandidates = input.llmReview
          ? await this.vocabularyLlmService.enrichDocumentCandidates({
              markdown: doc.markdown,
              candidates: extractedCandidates,
              targetLang: input.targetLang,
              nativeLang: input.nativeLang,
              llmReview: true,
            })
          : extractedCandidates;

        candidatesWithDuplicateState = await Promise.all(
          enrichedCandidates.map(async (candidate: DocumentVocabCandidate) => {
            const existing = await this.vocabularyRepository.findByWord(
              candidate.normalized,
              input.targetLang,
              input.nativeLang,
            );
            return new DocumentVocabCandidate(
              candidate.id,
              candidate.documentId,
              candidate.surface,
              candidate.normalized,
              candidate.lemma,
              candidate.vocabType,
              candidate.pos,
              candidate.translation,
              candidate.contextSentence,
              candidate.sentenceIndex,
              candidate.startOffset,
              candidate.endOffset,
              candidate.selectedByDefault,
              Boolean(existing),
              candidate.reviewSource,
            );
          }),
        );
      }

      await this.repository.replaceVocabularyCandidates(id, candidatesWithDuplicateState);
      const preparedDocument =
        (await this.repository.updateAnalysisStatus(id, 'ready', null)) ?? doc;

      return {
        document: this.toOutput(preparedDocument),
        candidates: candidatesWithDuplicateState.map((candidate: DocumentVocabCandidate) =>
          this.toCandidateOutput(candidate),
        ),
        llmReviewApplied: input.llmReview,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Vocabulary preparation failed';
      await this.repository.updateAnalysisStatus(id, 'failed', message);
      throw error;
    }
  }

  async confirmVocabulary(
    id: string,
    input: ConfirmDocumentVocabularyInput,
  ): Promise<ConfirmDocumentVocabularyOutput | null> {
    const doc = await this.repository.findById(id);
    if (!doc) {
      return null;
    }

    const candidates = await this.repository.findVocabularyCandidates(id);
    const candidatesById = new Map(
      candidates.map((candidate: DocumentVocabCandidate) => [candidate.id, candidate]),
    );

    const output: ConfirmDocumentVocabularyOutput = {
      savedCount: 0,
      skippedDuplicateCount: 0,
      failedCount: 0,
      savedItems: [],
      skippedItems: [],
      failedItems: [],
    };

    for (const item of input.items) {
      const storedCandidate = candidatesById.get(item.candidateId);
      if (!storedCandidate) {
        output.skippedItems.push({
          candidateId: item.candidateId,
          word: item.word,
          reason: 'missing_candidate',
        });
        continue;
      }

      const normalizedWord = item.word.trim();
      const existing = await this.vocabularyRepository.findByWord(
        normalizedWord,
        input.targetLang,
        input.nativeLang,
      );
      if (existing) {
        output.skippedDuplicateCount += 1;
        output.skippedItems.push({
          candidateId: item.candidateId,
          word: normalizedWord,
          reason: 'duplicate',
        });
        continue;
      }

      try {
        const created = await this.vocabularyRepository.create(
          normalizedWord,
          item.vocabType,
          (item.translation ?? '').trim(),
          input.targetLang,
          input.nativeLang,
          item.contextSentence,
          doc.id,
          item.pos ?? storedCandidate.pos,
        );
        output.savedCount += 1;
        output.savedItems.push({
          candidateId: item.candidateId,
          vocabularyId: created.id,
          word: created.word,
        });
      } catch (error) {
        output.failedCount += 1;
        output.failedItems.push({
          candidateId: item.candidateId,
          word: normalizedWord,
          reason: error instanceof Error ? error.message : 'Failed to save vocabulary item',
        });
      }
    }

    return output;
  }
}
