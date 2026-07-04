# Security policy

nad-agent holds a self-custodial wallet, so a few things matter more than usual.

## Reporting a vulnerability

Please do not open a public issue for a security bug. Report it privately through GitHub's
[private vulnerability reporting](https://github.com/portdeveloper/nad-agent/security/advisories/new),
or contact the maintainer directly. I'll acknowledge as fast as I can and work with you on a fix
before any public disclosure.

## Handling keys and secrets

- The wallet key is derived on your machine from `WDK_SEED` and never leaves it. Keep it that way.
- `.env` and `models/` are gitignored. Never commit a seed, a private key, or a `PIMLICO_API_KEY`.
  Only `.env.example` is tracked.
- Treat any seed you generate with `npm run gen-seed` as live funds. Use a throwaway seed for
  development.

## Scope

This is a v0 proof-of-concept: native MON only, single account, testnet-first. Don't put meaningful
funds behind it. Reads hit Monad for real; sends are a dry-run unless you set `PIMLICO_API_KEY`.
Review the code before you point it at anything that matters.
