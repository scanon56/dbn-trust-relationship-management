# DB Helper (Quick Start)

A tiny guide for using the database helper script.

- Script: `./scripts/db-helper.sh`
- Requires: `psql` on your PATH, and a `.env` at the project root (or defaults are used).

## Common Commands

```bash
# Verify connectivity & server version
./scripts/db-helper.sh test

# List connections (most useful starter)
./scripts/db-helper.sh connections

# Open interactive psql (exit with \q)
./scripts/db-helper.sh console
```

## Environment

The script loads environment variables from the repo root `.env`:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dbn_trust_management
DB_USER=postgres
DB_PASSWORD=postgres
```

If `.env` is missing, the script uses the defaults above and prints a warning.

## Notes

- Run from anywhere: it resolves the repo root automatically.
- If you see "psql: command not found", install the PostgreSQL client tools.
  - macOS (Homebrew):
    ```bash
    brew install libpq
    brew link --force libpq
    ```
- For more commands and examples, see `docs/DB_TOOLS_README.md`.
