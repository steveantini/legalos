// Empty stub aliased in vitest.config.ts for the Next.js "server-only" /
// "client-only" guard packages, which throw outside an RSC bundle. The 2P-6a unit
// tests target pure functions in server modules; stubbing the guards lets those
// modules import under vitest (their env reads are per-call, never at module load).
export {};
