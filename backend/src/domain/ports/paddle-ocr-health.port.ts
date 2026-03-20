export abstract class IPaddleOcrHealthPort {
  abstract isReachable(): Promise<boolean>;
  abstract listModels(): Promise<string[]>;
  abstract getDevice(): Promise<'gpu' | 'cpu' | null>;
}
