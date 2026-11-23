# TicketNXT

A Discord bot built with Node.js and discord.js v14.

## Requirements
- Node.js 20 or newer
- A Discord application and bot token

## Setup
1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Put your bot token in `.env` as `DISCORD_TOKEN`.
4. Enable the **Message Content Intent** in the Discord Developer Portal if you want to use the sample `!ping` message command.
5. Start the bot with `npm start`.

## Included command
- `!ping` — replies with `Pong!`.

Keep your `.env` file private. Never commit your bot token.
