# Tweet Rewrite

A Chrome extension that adds a **Rewrite** button to the X (Twitter) post box.

- **Click Rewrite** to fix spelling and grammar. You get 3 versions.
- **Hover over Rewrite** to pick a mood (Professional, Casual, Witty, Bold, Friendly, Concise). You get 3 versions in that mood.
- The versions appear right below the post box. Click one to replace your draft. Line breaks and blank lines are kept.
- It never posts for you. You still press **Post** yourself.

## How it rewrites

- **Grok on X** (default, no key needed): uses X's built-in Grok through a hidden **Private Chat**. No chat window opens, and nothing is saved to your Grok history.
- **Claude API** (optional): add your Anthropic API key in Settings.

## Install

1. Download this repo (**Code → Download ZIP**) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Open x.com and start writing a post.

## Settings

Click the extension's icon in the Chrome toolbar to:
- choose the engine (Grok or Claude)
- set your Anthropic API key (Claude only; it's kept in Chrome's storage and sent only to api.anthropic.com)
- pick the Claude model
- edit the moods shown on hover
