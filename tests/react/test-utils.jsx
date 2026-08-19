import { render as tlRender, renderHook as tlRenderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

export const render = (ui, options) => {
  const testQueryClient = createTestQueryClient();
  const OptionsWrapper = options?.wrapper || React.Fragment;
  const Wrapper = ({ children }) => (
    <QueryClientProvider client={testQueryClient}>
      <OptionsWrapper>{children}</OptionsWrapper>
    </QueryClientProvider>
  );
  return tlRender(ui, { ...options, wrapper: Wrapper });
};

export const renderHook = (hook, options) => {
  const testQueryClient = createTestQueryClient();
  const OptionsWrapper = options?.wrapper || React.Fragment;
  const Wrapper = ({ children }) => (
    <QueryClientProvider client={testQueryClient}>
      <OptionsWrapper>{children}</OptionsWrapper>
    </QueryClientProvider>
  );
  return tlRenderHook(hook, { ...options, wrapper: Wrapper });
};

export * from '@testing-library/react';
