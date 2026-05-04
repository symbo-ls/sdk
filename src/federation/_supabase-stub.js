// Test-only stub: minimal Supabase client surface that satisfies the
// federation factory + client.js wiring without opening network sockets.
export function createClient(_url, _key, _opts) {
  return {
    auth: {
      onAuthStateChange: (_fn) => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    realtime: { setAuth: () => {} },
  }
}
