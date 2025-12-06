import { registerGlobalErrorHandlers } from '../registerGlobalErrorHandlers';

describe('registerGlobalErrorHandlers', () => {
  it('attaches listeners and logs unhandled errors', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);

    registerGlobalErrorHandlers();

    expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

    // Trigger handlers manually
    const errorHandler = (addEventListenerSpy.mock.calls.find((c) => c[0] === 'error')?.[1] ??
      (() => undefined)) as (event: ErrorEvent) => void;
    errorHandler(
      new ErrorEvent('error', {
        message: 'boom',
        filename: 'file.ts',
        lineno: 1,
        colno: 2,
        error: new Error('boom'),
      })
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith('[GlobalError] Unhandled error', expect.any(Object));

    consoleErrorSpy.mockRestore();
    addEventListenerSpy.mockRestore();
    processOnSpy.mockRestore();
  });
});

