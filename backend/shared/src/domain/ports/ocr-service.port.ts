import { ImageData } from '../entities/image-data.entity';

export abstract class IOCRService {
  abstract extractText(image: ImageData): Promise<string>;
}
