import { Module } from '@nestjs/common';
import { GatewayEditorController } from './gateway-editor.controller';

@Module({
  controllers: [GatewayEditorController],
})
export class GatewayEditorModule {}
