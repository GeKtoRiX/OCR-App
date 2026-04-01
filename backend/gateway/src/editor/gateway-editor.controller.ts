import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_MIME_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const editorAssetsDir = path.join(process.cwd(), 'data', 'editor-assets');

@Controller('api/editor')
export class GatewayEditorController {
  @Post('uploads/images')
  @UseInterceptors(
    FileInterceptor('upload', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No upload file provided');
    }

    const extension = ALLOWED_MIME_TYPES.get(file.mimetype);
    if (!extension) {
      throw new BadRequestException('Unsupported image type');
    }

    await fs.promises.mkdir(editorAssetsDir, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    await fs.promises.writeFile(path.join(editorAssetsDir, filename), file.buffer);

    return {
      url: `/editor-assets/${filename}`,
    };
  }
}
