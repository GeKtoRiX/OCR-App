export * from './domain/entities/exercise-attempt.entity';
export * from './domain/entities/image-data.entity';
export * from './domain/entities/ocr-result.entity';
export * from './domain/entities/practice-session.entity';
export * from './domain/entities/saved-document.entity';
export * from './domain/entities/vocabulary-word.entity';

export * from './domain/ports/f5-tts.port';
export * from './domain/ports/kokoro.port';
export * from './domain/ports/lm-studio-chat.port';
export * from './domain/ports/lm-studio-health.port';
export * from './domain/ports/ocr-service.port';
export * from './domain/ports/paddle-ocr-health.port';
export * from './domain/ports/practice-session-repository.port';
export * from './domain/ports/saved-document-repository.port';
export * from './domain/ports/supertone.port';
export * from './domain/ports/text-structuring-service.port';
export * from './domain/ports/vocabulary-llm-service.port';
export * from './domain/ports/vocabulary-repository.port';
export * from './domain/ports/voxtral-tts.port';
export * from './domain/value-objects/uploaded-file.vo';

export * from './contracts/agentic.contracts';
export * from './contracts/document.contracts';
export * from './contracts/ocr.contracts';
export * from './contracts/tts.contracts';
export * from './contracts/vocabulary.contracts';
