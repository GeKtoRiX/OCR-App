import { of } from 'rxjs';
import { GatewayHealthController } from './gateway-health.controller';
import { OCR_PATTERNS, TTS_PATTERNS } from '@ocr-app/shared';

describe('GatewayHealthController', () => {
  it('merges OCR and TTS health responses', async () => {
    const ocrClient = {
      send: jest.fn().mockReturnValue(
        of({
          ocrReachable: true,
          ocrModels: ['model-a'],
          ocrDevice: 'gpu',
          lmStudioReachable: true,
          lmStudioModels: ['lm-a'],
        }),
      ),
    };
    const ttsClient = {
      send: jest.fn().mockReturnValue(
        of({
          superToneReachable: true,
          kokoroReachable: false,
        }),
      ),
    };

    const controller = new GatewayHealthController(ocrClient as any, ttsClient as any);

    await expect(controller.getHealth()).resolves.toEqual({
      ocrReachable: true,
      ocrModels: ['model-a'],
      ocrDevice: 'gpu',
      lmStudioReachable: true,
      lmStudioModels: ['lm-a'],
      superToneReachable: true,
      kokoroReachable: false,
    });

    expect(ocrClient.send).toHaveBeenCalledWith(OCR_PATTERNS.CHECK_HEALTH, {});
    expect(ttsClient.send).toHaveBeenCalledWith(TTS_PATTERNS.CHECK_HEALTH, {});
  });
});
