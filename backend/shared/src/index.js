"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./domain/entities/exercise-attempt.entity"), exports);
__exportStar(require("./domain/entities/image-data.entity"), exports);
__exportStar(require("./domain/entities/ocr-result.entity"), exports);
__exportStar(require("./domain/entities/practice-session.entity"), exports);
__exportStar(require("./domain/entities/saved-document.entity"), exports);
__exportStar(require("./domain/entities/vocabulary-word.entity"), exports);
__exportStar(require("./domain/ports/kokoro.port"), exports);
__exportStar(require("./domain/ports/lm-studio-chat.port"), exports);
__exportStar(require("./domain/ports/lm-studio-health.port"), exports);
__exportStar(require("./domain/ports/ocr-health.port"), exports);
__exportStar(require("./domain/ports/ocr-service.port"), exports);
__exportStar(require("./domain/ports/practice-session-repository.port"), exports);
__exportStar(require("./domain/ports/saved-document-repository.port"), exports);
__exportStar(require("./domain/ports/supertone.port"), exports);
__exportStar(require("./domain/ports/text-structuring-service.port"), exports);
__exportStar(require("./domain/ports/vocabulary-llm-service.port"), exports);
__exportStar(require("./domain/ports/vocabulary-repository.port"), exports);
__exportStar(require("./domain/value-objects/uploaded-file.vo"), exports);
__exportStar(require("./contracts/agentic.contracts"), exports);
__exportStar(require("./contracts/document.contracts"), exports);
__exportStar(require("./contracts/ocr.contracts"), exports);
__exportStar(require("./contracts/tts.contracts"), exports);
__exportStar(require("./contracts/vocabulary.contracts"), exports);
//# sourceMappingURL=index.js.map
