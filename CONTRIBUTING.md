# Contributing to Zygarde

Thanks for your interest! Bug reports, fixes, and feature ideas are all welcome.

## Reporting issues

Open an issue with:

- What you expected to happen and what actually happened.
- Your Zygarde version (Docker image tag or git commit) and how you run it (Docker or bare metal).
- The versions of Dragonite, and Kōji or Golbat if the problem involves them.
- Relevant log lines. **Remove secrets first**: Discord tokens, client secrets, webhook URLs, database URLs, and Kōji secrets must never be posted.

For a security problem, please don't open a public issue. Report it privately from the repository's **Security** tab (**Report a vulnerability**).

## Development setup

You need Node.js 22 and, optionally, a MySQL/MariaDB database (sessions fall back to in-memory without one).

```bash
npm ci
cp .env.example .env   # at minimum set DRAGONITE_URL
npm run dev
```

The test suite needs no database or external services.

## Sending changes

1. Fork the repo and create a branch from `master`.
2. Keep each change focused. Open an issue first for anything large so we can agree on the approach.
3. Add or update tests next to the code you change (`foo.ts` → `foo.test.ts`).
4. Make sure all three of these pass:

   ```bash
   npm run check
   npm run test
   npm run format:check
   ```

5. If you add a setting, document it in both `.env.example` (marked Required or Optional) and the README's Configuration section.
6. Open a pull request describing what changed and why. CI runs the same three checks on every pull request.

[`CLAUDE.md`](CLAUDE.md) describes the architecture and conventions in depth: the feature-folder layout, the permission model, the `QueryExecutor` pattern for DB access, and the external integration boundaries. It's worth a skim before larger changes, whether or not you use an AI coding agent.

## License

By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE), the same license as the project.
