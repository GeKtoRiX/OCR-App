export abstract class IHealthCheckPort {
  abstract isReachable(): Promise<boolean>;
  abstract listModels(): Promise<string[]>;
}
