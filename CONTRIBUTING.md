# Contributing to Riptide

> All work targets the `dev` branch. Changes are tested there before being merged into `main` for releases.

## Branches

- **`dev`**: where everything in progress lands. Branch from it and open pull requests against it.
- **`main`**: released code only. It changes only through release merges from `dev`.

A pull request into `main` without the **release** label fails the *PR Target Branch Guard* check.

## Releasing

1. On `dev`, bump `__version__` in `version.py` and commit `Bump version to X.Y.Z`.
2. Merge `dev` into `main` (`Merge dev to main for vX.Y.Z`). As a pull request, give it the **release** label: the
   *Release Version Guard* fails it until `version.py` is bumped.
3. Tag the merge `vX.Y.Z`, push the tag, and publish a GitHub release for it with the notes and a
   **Full Changelog** link to the previous tag.
4. Bring `dev` up to date with `main` and push it, then carry on working on `dev`.

## Checks

CI checks that the Python compiles and every file in `static/` parses on pushes to `dev` and `main` and on pull requests.
Before pushing, run the same locally:

```sh
python -m py_compile server.py mcp_server.py version.py
for f in static/*.js; do node --check "$f"; done
```
