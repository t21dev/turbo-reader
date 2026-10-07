# Privacy

Turbo Reader is a feed reader that runs on your computer. It has no account,
no analytics, no telemetry and no server of its own. Nothing you read, save or
star is sent to the people who make it.

## What stays on your computer

Everything Turbo Reader keeps is stored in its data folder:

- your feeds, folders and their order
- the articles it has fetched, what you have read, starred or hidden
- your settings, window size and position
- the notification history (the last 200 entries)
- the key for the AI agent server, if you made one

The data folder is the normal per-user app data folder for
`dev.t21.turbo-reader` (on Windows, `%APPDATA%\dev.t21.turbo-reader`). The
portable Windows build keeps it in a `data` folder next to the exe instead.
Delete that folder and everything is gone.

## When it goes online

Turbo Reader connects to other systems only for these:

- **The feeds and websites you add.** It fetches each feed to look for new
  articles, and the site's icon. When you choose "Load full content", it
  fetches that article's page. Each request goes straight from your computer
  to that site, which sees your IP address as it would in a browser.
- **Pictures and videos inside articles.** These load from wherever the
  publisher put them, the same as on their website. YouTube videos play inline
  only if you turn that on in Settings, and then through
  `youtube-nocookie.com`.
- **GitHub, to check for a new version.** Once when the app opens, it asks
  GitHub for the latest Turbo Reader release. Turn this off in About. GitHub
  sees your IP address; the request carries nothing about you or your library.

Links you open from an article open in your own browser, not in Turbo Reader.

## AI agents

The agent server is off unless you turn it on in Settings > AI agents. When it
is on, it answers programs on this computer, or on your local network if you
allow that, and only those that present the key you created. An agent you
connect can read your library. If its key has write access, it can also add
and remove feeds, mark and star articles, and refresh. What an agent does with
what it reads is up to that agent and its maker.

An agent can also start `turbo-reader --mcp` itself on this computer, with the
app closed. That talks only to the agent that started it, reads your library,
and changes nothing unless it was started with `--allow-write`.

Changes agents make through the app's agent server are listed in the
notification bell, under the agent's name.

The Turbo Reader skill is written into an agent's folder (such as
`~/.claude/skills/turbo-reader/`) only when you click Install there, and Remove
deletes only that folder. To see whether an installed copy is current, the app
reads it on your computer; nothing about it leaves your machine.

## Downloads

Release files are hosted on GitHub. Each release has a `SHA256SUMS.txt` so you
can check a download is the file that was built.

## Questions

Open an issue at <https://github.com/t21dev/turbo-reader/issues>. This policy
changes only with the app, and the changes show in this file's history.
