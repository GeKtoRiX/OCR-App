describe('decorator metadata fallbacks', () => {
  it('loads decorated modules when Reflect helpers are unavailable', () => {
    const reflectWithHelpers = Reflect as typeof Reflect & {
      decorate?: typeof Reflect.decorate;
      metadata?: typeof Reflect.metadata;
    };
    const originalDecorate = reflectWithHelpers.decorate;
    const originalMetadata = reflectWithHelpers.metadata;

    delete reflectWithHelpers.decorate;
    delete reflectWithHelpers.metadata;

    try {
      jest.isolateModules(() => {
        require('./agentic/application/agent-ecosystem.service');
        require('./agentic/presentation/controllers/agent-ecosystem.controller');
        require('./agentic/presentation/modules/agent-ecosystem.module');
        require('./application/use-cases/health-check.use-case');
        require('./application/use-cases/practice.use-case');
        require('./application/use-cases/process-image.use-case');
        require('./application/use-cases/saved-document.use-case');
        require('./application/use-cases/synthesize-speech.use-case');
        require('./application/use-cases/vocabulary.use-case');
        require('./infrastructure/f5/f5-tts.service');
        require('./infrastructure/kokoro/kokoro.service');
        require('./infrastructure/lm-studio/lm-studio-ocr.service');
        require('./infrastructure/lm-studio/lm-studio-structuring.service');
        require('./infrastructure/lm-studio/lm-studio-vocabulary.service');
        require('./infrastructure/paddleocr/paddleocr-health.service');
        require('./infrastructure/paddleocr/paddleocr-ocr.service');
        require('./infrastructure/sqlite/sqlite-connection.provider');
        require('./infrastructure/sqlite/sqlite-practice-session.repository');
        require('./infrastructure/sqlite/sqlite-saved-document.repository');
        require('./infrastructure/sqlite/sqlite-vocabulary.repository');
        require('./presentation/controllers/document.controller');
        require('./presentation/controllers/health.controller');
        require('./presentation/controllers/ocr.controller');
        require('./presentation/controllers/practice.controller');
        require('./presentation/controllers/tts.controller');
        require('./presentation/controllers/vocabulary.controller');
        require('./presentation/modules/database.module');
        require('./presentation/modules/document.module');
        require('./presentation/modules/health.module');
        require('./presentation/modules/lm-studio.module');
        require('./presentation/modules/ocr.module');
        require('./presentation/modules/tts.module');
        require('./presentation/modules/vocabulary.module');
      });
    } finally {
      reflectWithHelpers.decorate = originalDecorate;
      reflectWithHelpers.metadata = originalMetadata;
    }
  });
});
