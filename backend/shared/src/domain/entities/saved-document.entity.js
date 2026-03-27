"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SavedDocument = void 0;
class SavedDocument {
    id;
    markdown;
    filename;
    createdAt;
    updatedAt;
    analysisStatus;
    analysisError;
    analysisUpdatedAt;
    constructor(id, markdown, filename, createdAt, updatedAt, analysisStatus, analysisError, analysisUpdatedAt) {
        this.id = id;
        this.markdown = markdown;
        this.filename = filename;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.analysisStatus = analysisStatus;
        this.analysisError = analysisError;
        this.analysisUpdatedAt = analysisUpdatedAt;
    }
}
exports.SavedDocument = SavedDocument;
//# sourceMappingURL=saved-document.entity.js.map
