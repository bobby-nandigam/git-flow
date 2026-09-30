// Deterministic env for unit tests. No real secrets, no network, no DB.
process.env.AUTH_SECRET = "test_secret_key_used_only_for_unit_tests_000000";
process.env.GITHUB_WEBHOOK_SECRET = "test_webhook_secret";
process.env.WORKER_SECRET = "test_worker_secret";
process.env.AI_PROVIDER = "none";
process.env.APP_PUBLIC_URL = "http://localhost:3000";
