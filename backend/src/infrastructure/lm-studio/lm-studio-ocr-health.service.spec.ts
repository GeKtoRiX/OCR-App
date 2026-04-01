import { LMStudioOcrHealthService } from './lm-studio-ocr-health.service';

describe('LMStudioOcrHealthService', () => {
  it('delegates reachability and model listing to LM Studio health and reports null device', async () => {
    const lmStudioHealth = {
      isReachable: jest.fn().mockResolvedValue(true),
      listModels: jest.fn().mockResolvedValue(['vision-model']),
    };

    const service = new LMStudioOcrHealthService(lmStudioHealth as any);

    await expect(service.isReachable()).resolves.toBe(true);
    await expect(service.listModels()).resolves.toEqual(['vision-model']);
    await expect(service.getDevice()).resolves.toBeNull();
  });
});
