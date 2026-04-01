import { Module } from '@nestjs/common';
import { EditorUploadController } from '../controllers/editor-upload.controller';

@Module({
  controllers: [EditorUploadController],
})
export class EditorModule {}
