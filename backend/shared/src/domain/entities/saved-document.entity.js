"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SavedDocument = void 0;
class SavedDocument {
    id;
    markdown;
    filename;
    createdAt;
    updatedAt;
    constructor(id, markdown, filename, createdAt, updatedAt) {
        this.id = id;
        this.markdown = markdown;
        this.filename = filename;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
exports.SavedDocument = SavedDocument;
//# sourceMappingURL=saved-document.entity.js.map