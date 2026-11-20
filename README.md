# Tweet Rewrite

**Demo video:** [watch / download](demo/rewrite-demo.mp4) (22 s)

A Chrome extension that adds a **Rewrite** button to the X (Twitter) post box.

- **Click Rewrite** to fix spelling and grammar. You get 3 versions.
- **Hover over Rewrite** to pick a mood (Professional, Casual, Witty, Bold, Friendly, Concise). You get 3 versions in that mood.
- The versions appear right below the post box. Click one to replace your draft. Line breaks and blank lines are kept.
- It never posts for you. You still press **Post** yourself.

## How it rewrites

It uses X's built-in **Grok**, with your normal X login. No API key, no extra cost.
When you click Rewrite, it opens Grok out of sight in a **Private Chat**, asks for the rewrite, reads the reply and closes the chat. No chat window shows, and nothing is saved to your Grok history.
You need an X account that can use Grok.

## Install

1. Download this repo (**Code → Download ZIP**) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Open x.com and start writing a post.

## Settings

Click the extension's icon in the Chrome toolbar to edit the moods shown on hover.
