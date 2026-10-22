// Isolate endpoint unit tests from TanStack's RPC compilation.
export default {
  resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
  test: { environment: 'node', include: ['scripts/test-meta*.test.ts'] },
};