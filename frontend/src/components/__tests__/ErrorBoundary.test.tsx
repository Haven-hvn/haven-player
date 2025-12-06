import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

const GoodChild: React.FC = () => <div>safe content</div>;

const BadChild: React.FC = () => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let reloadSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    reloadSpy = jest.spyOn(window.location, 'reload').mockImplementation(() => undefined as unknown as void);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    reloadSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('shows fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload app/i })).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('reloads the app when the reload button is clicked', () => {
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /reload app/i }));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

