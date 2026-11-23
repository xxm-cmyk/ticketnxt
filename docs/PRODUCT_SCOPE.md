# TicketNXT — Product Scope

This document records the agreed product direction and the current implementation boundary.

## Product direction

TicketNXT is a highly configurable Discord ticket system. Server managers customize the ticket panel and ticket workflow from a web dashboard with a live preview. Features are optional where practical.

## Implemented in development build 0.2.0

- Discord OAuth login and server selection for users with Manage Server permission.
- Persistent file-backed dashboard sessions.
- Persistent guild configuration, ticket records, and ticket numbering in the hosting volume (not committed to Git).
- Web editor with live preview.
- Traditional Embed-style and Discord Components V2 panel messages.
- Ticket options displayed as buttons or a select menu.
- Up to 25 ticket options, with order controls.
- Per-option emoji, support roles, allowed-to-open roles, category, channel-name template, reason prompt, and inactivity timeout.
- Optional panel image and accent color.
- Configurable override roles that retain access to claimed tickets.
- Publish or update the configured panel in a text channel.
- Private ticket channel creation with member, support-role, bot, and override-role permissions.
- One open ticket per member per server.
- Optional reason modal before ticket creation.
- Staff claim; after claiming, configured support roles are hidden while the claimant and override roles retain access.
- Transfer to another member who has an appropriate support or override role.
- Close ticket, lock the opener, and attach an HTML transcript (up to the most recent 1,000 messages). Message text requires the optional privileged Message Content intent to be enabled in the Discord Developer Portal and ENABLE_MESSAGE_CONTENT=true in hosting.
- Automatic close after a configured inactivity period, based on new messages in the ticket.

## Agreed panel editor

- Live preview while editing.
- Choose between Discord Components V2 and a traditional Embed-style message.
- Choose buttons or a select menu for ticket options.
- Configure layout within Discord's supported component limits.
- Optional image and message content.
- Configure each ticket option independently.
- Choose emoji from the server's custom emojis or standard emoji.
- Configure support role and allowed opener roles per option.
- Optional settings remain independently switchable.

## Agreed ticket workflow

- Custom ticket channel naming templates, including ticket number and username.
- Claiming and transferring tickets.
- After a ticket is claimed, hide it from other configured support roles while keeping it accessible to override roles.
- Transcript generation.
- Automatic closure after a configurable period of inactivity.
- Ask the member for the reason before creating the ticket and show the answer to staff.
- Each workflow feature is optional.

## Current implementation limits / decisions still open

- One active panel configuration per server in this build. Multi-panel support is not implemented.
- Closed tickets remain in their channels; the opener is hidden and the channel is renamed with a closed prefix. Reopen and deletion policies are not implemented.
- Transcripts are attached as HTML files in the ticket channel; separate transcript log channels and external hosting are not implemented.
- Transfer uses a member ID or mention entered by staff.
- The inactivity timer checks at roughly one-minute intervals and counts non-bot messages.
- File-backed JSON storage is suitable for a single running bot instance; it is not a multi-instance database.
- OAuth dashboard access is limited to Manage Server users; detailed delegated dashboard roles are not implemented.
- Exact acceptance checklist and final release/deployment process remain open.

## Operational requirements

- Keep `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, and `SESSION_SECRET` only in hosting environment variables.
- The bot needs channel visibility, message sending, embed links, attachment, Manage Channels, and Manage Roles permissions.
- Message Content intent is optional; enable it only when full message text in transcripts is needed.
- The bot's highest role must be above support and override roles used in ticket permission overwrites.
- Keep the `data/` directory on persistent hosting storage and excluded from Git.
- Do not label the system production-ready until Discord interactions and permission behavior have been tested in a real test server.
