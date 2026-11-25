# Herdr PR Review mod

A Herdr panel for reviewing GitHub pull requests. It uses `gh` for GitHub API access, so the work machine needs Herdr and GitHub CLI installed and authenticated (`gh auth login`). Python 3 is also required for the backend.

## Install on another machine

In Herdr on the work machine, ask the built-in agent to install the PR Review mod from this repository using the prompt below. The generated `gpui-kit.d.ts` file is intentionally omitted; Herdr generates it locally and it is only used for editor/type checking, not runtime.

### Install prompt

> Install the Herdr PR Review mod from https://github.com/vietanhtran16/my-herdr. Clone the repository, then copy `mods/pr-review` into `~/.config/herdr-app/mods/pr-review` (create the parent folder if needed). Do not copy `.herdr-pr-review`; it is a local installation marker. Do not copy `gpui-kit.d.ts`; Herdr supplies its generated type declarations locally. Confirm the mod is loaded, run `herdr-app check ~/.config/herdr-app/mods/pr-review`, and tell me if any dependencies are missing. The mod uses Python 3 and GitHub CLI (`gh`); if needed, guide me through `gh auth login` rather than asking for or storing a token.

## Manual install

```sh
git clone https://github.com/vietanhtran16/my-herdr.git
mkdir -p ~/.config/herdr-app/mods
cp -R my-herdr/mods/pr-review ~/.config/herdr-app/mods/pr-review
herdr-app check ~/.config/herdr-app/mods/pr-review
```

Herdr watches mod folders and should load the mod automatically. The mod reads/writes review data under `~/.local/share/herdr-pr-review` by default. That data is per machine and should not be committed.
