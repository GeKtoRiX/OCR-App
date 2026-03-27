"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageData = void 0;
class ImageData {
    buffer;
    mimeType;
    originalName;
    constructor(buffer, mimeType, originalName) {
        this.buffer = buffer;
        this.mimeType = mimeType;
        this.originalName = originalName;
    }
    toBase64DataUrl() {
        return `data:${this.mimeType};base64,${this.buffer.toString('base64')}`;
    }
}
exports.ImageData = ImageData;
//# sourceMappingURL=image-data.entity.js.map