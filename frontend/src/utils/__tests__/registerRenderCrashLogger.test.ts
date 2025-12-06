import { registerRenderCrashLogger } from '../registerRenderCrashLogger';

describe('registerRenderCrashLogger', () => {
  it('logs render-process-gone events with reason and exitCode', () => {
    const onMock = jest.fn();
    const fakeWebContents = { on: onMock } as unknown as Electron.WebContents;
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    registerRenderCrashLogger(fakeWebContents);

    expect(onMock).toHaveBeenCalledWith(
      'render-process-gone',
      expect.any(Function)
    );

    const handler = onMock.mock.calls[0][1] as (event: unknown, details: { reason: string; exitCode: number }) => void;
    handler(undefined, { reason: 'crashed', exitCode: 1 });

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Renderer] process gone', {
      reason: 'crashed',
      exitCode: 1,
    });

    consoleErrorSpy.mockRestore();
  });
});

