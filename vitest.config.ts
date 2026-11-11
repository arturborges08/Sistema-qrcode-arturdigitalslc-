import { defineConfig } from "vitest/config";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/qrdin_test";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DB,
      APP_BASE_URL: "https://qr.teste.local",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      // Servidor falso da InfinitePay iniciado em tests/billing.test.ts.
      INFINITEPAY_HANDLE: "loja-teste",
      INFINITEPAY_API_URL: "http://127.0.0.1:4599",
    },
  },
});
