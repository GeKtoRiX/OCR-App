export abstract class ILmStudioHealthPort {
  abstract isReachable(): Promise<boolean>;
  abstract listModels(): Promise<string[]>;
}
