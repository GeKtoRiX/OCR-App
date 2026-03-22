import { Injectable } from '@nestjs/common';
import { ITextStructuringService } from '../../domain/ports/text-structuring-service.port';

@Injectable()
export class PassthroughStructuringService extends ITextStructuringService {
  async structureAsMarkdown(rawText: string): Promise<string> {
    return rawText;
  }
}
