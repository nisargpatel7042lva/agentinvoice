# Repo setup notes (cached 2026-11-05)

## npm workspaces (docs.npmjs.com/cli/using-npm/workspaces)
- Root `package.json` has a `"workspaces": [...]` array. Globs such as `"packages/*"` are allowed.
- `npm install` symlinks every workspace into the root `node_modules`, so `npm link` isn't needed.
- `npm init -w ./packages/a` creates a workspace and adds it to the root list.
- To add a dependency to one workspace: `npm install <dep> -w <ws>`. Adding a workspace name as `<dep>` symlinks it locally.
- To run a script in one workspace: `npm run <s> --workspace=<ws>`. In all of them: `--workspaces`, which runs in the declared order.
- `--if-present` skips workspaces that don't define the script.

## GitHub protected branches (docs.github.com/repositories)
- Require a pull request, optionally with N approvals, dismissal of stale reviews, and approval from someone other than the last pusher.
- Require status checks to pass before merging. "Strict" means the branch must be up to date with the base. Job names must be unique across workflows.
- "Do not allow bypassing" applies the rules to admins too. Force pushes and branch deletion are blocked by default.
- Rulesets are the newer alternative, and more than one can apply at once.
- Plan: protection on a PRIVATE repo needs GitHub Pro, Team or Enterprise. Free accounts only get it on public repos. Check this with the API in step 8.

## Foundry (getfoundry.sh/projects/project-layout, formerly book.getfoundry.sh)
- Layout: `foundry.toml`, `src/`, `test/` (`*.t.sol`), `script/` (`*.s.sol`), `lib/` (git submodules, e.g. forge-std), plus the generated `out/`, `cache/` and `broadcast/`.
- Add `out/`, `cache/` and `broadcast/` to `.gitignore`.
- Tests import `Test` from `forge-std/Test.sol`, and scripts import `Script` from `forge-std/Script.sol`.
- Remappings go in `foundry.toml` or `remappings.txt`.
- CI: install Foundry with the action `foundry-rs/foundry-toolchain@v1` (not in the docs page; this is the standard action).

## vitest (vitest.dev)
- The fetch failed twice (socket hang up), so nothing is cached yet. Retry later.
