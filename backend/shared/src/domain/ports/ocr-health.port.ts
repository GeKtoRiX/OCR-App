export abstract class IOcrHealthPort {
  abstract isReachable(): Promise<boolean>;
  abstract listModels(): Promise<string[]>;
  abstract getDevice(): Promise<'gpu' | 'cpu' | null>;
}
