# Publishing and reporting security issues

Do not commit credentials. Copy `.env.example` to `.env` only on your own machine. `.env`, environment variants, private key files, logs and runtime data are ignored. The example configuration contains no real credentials.

Before publishing, run:

```sh
python scripts/check_secrets.py --history
```

The checker scans tracked and publishable untracked files plus reachable Git-history blobs for common provider tokens, private keys and environment credential assignments. It reports locations without displaying the values. Its patterns are heuristic; a clean scan is not a guarantee that every possible secret format is covered. Enable GitHub secret scanning and push protection where available. The GitHub Actions workflow runs the checker, backend tests and frontend build.

If a credential has ever been committed, revoke or rotate it first. Removing it from the current file does not remove it from Git history. Coordinate any history rewrite with collaborators. Do not post a real key in a public issue or pull request.

User-supplied chat keys are request-scoped and are not persisted by this application. They are sent to a fixed allowlisted provider endpoint. Do not enable request-body logging in reverse proxies or monitoring services that could capture them. Use HTTPS for any remote deployment.

This is a local research application without user authentication or tenant isolation. Generated-code execution uses subprocess limits and a scrubbed environment; it is not a container and does not block filesystem or network access. Keep the service on loopback and use OS-level isolation for untrusted generated code. GitHub readiness does not imply public-hosting readiness.

Report a suspected vulnerability through the repository's private vulnerability-reporting feature when enabled. Share reproduction details without credentials, private documents or personal data.
