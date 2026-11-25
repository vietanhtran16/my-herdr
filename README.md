# Herdr mods

This repository contains two Herdr mods:

- **PR Review** — review GitHub pull requests. It uses GitHub CLI (`gh`) and Python 3; `gh` must be authenticated on the work machine.
- **Agent Dashboard** — view agents across spaces by status and click a card to preview its terminal.

## Install on another machine

In Herdr on the work machine, ask the built-in agent to install both mods from this repository using the prompt below. Generated `gpui-kit.d.ts` files are intentionally omitted; Herdr generates them locally, and they are only used for editor/type checking, not runtime.

### Install prompt

> Install both Herdr mods from https://github.com/vietanhtran16/my-herdr. Clone the repository, then copy `mods/pr-review` to `~/.config/herdr-app/mods/pr-review` and `mods/agent-dashboard` to `~/.config/herdr-app/mods/agent-dashboard` (create the mods folder if needed). Do not copy `.herdr-pr-review`; it is a local installation marker. Do not copy either generated `gpui-kit.d.ts`; Herdr supplies those locally. Confirm both mods load, run `herdr-app check ~/.config/herdr-app/mods/pr-review` and `herdr-app check ~/.config/herdr-app/mods/agent-dashboard`, and report any missing dependencies. PR Review requires Python 3 and GitHub CLI (`gh`) authenticated on this machine; if needed, guide me through `gh auth login` rather than asking for or storing a token.

## Manual install

```sh
git clone https://github.com/vietanhtran16/my-herdr.git
mkdir -p ~/.config/herdr-app/mods
cp -R my-herdr/mods/pr-review ~/.config/herdr-app/mods/pr-review
cp -R my-herdr/mods/agent-dashboard ~/.config/herdr-app/mods/agent-dashboard
herdr-app check ~/.config/herdr-app/mods/pr-review
herdr-app check ~/.config/herdr-app/mods/agent-dashboard
```

Herdr watches mod folders and should load both mods automatically. PR Review reads and writes review data under `~/.local/share/herdr-pr-review` by default. That data is per machine and should not be committed.
