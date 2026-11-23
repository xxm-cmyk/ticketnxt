# TicketNXT — Product Scope

## Product direction

TicketNXT is a Discord ticket bot with a web dashboard. The dashboard is configured by a server owner or a member with Manage Server permission.

## Panel builder

- Components V2 only; legacy Embed panel mode is not used.
- Exactly one Container per panel message. The Container is the fixed outer wrapper.
- Add components from a list, edit their fields, reorder them, or remove them.
- Supported editable components: Text Display, Section, Media Gallery, Separator, and Button.
- Thumbnail is configured as a Section accessory.
- Buttons are automatically wrapped in Discord Action Rows and can be grouped up to five per row.
- Button styles: Primary, Secondary, Success, Danger, and Link.
- Ticket-opening buttons must be linked to one of the configured ticket types. Link buttons require an HTTPS URL.
- No custom panel accent-color setting.
- Discord server custom emojis are loaded from the selected guild; standard Unicode emoji are also available.
- Maximum five ticket types per panel.
- Each ticket type can define its name, description, emoji, support roles, allowed opener roles, category, channel-name template, reason prompt, and inactivity timeout.
- A live preview is shown while editing.
- Discord's Components V2 component and text limits are validated before saving.

## Ticket workflow

- One open ticket per member per server.
- Ticket channels are private to the opener, configured support roles, override roles, and the bot.
- Staff can claim and transfer tickets.
- Only staff/admin users can close tickets.
- On close, the bot posts a 10-second notice, generates an HTML transcript, sends it to the opener by DM and to the configured transcript-log channel, then deletes the ticket channel.
- The ticket channel is not deleted unless both transcript deliveries succeed. Failed DM or log delivery leaves the channel available for retry.
- The transcript log channel is selected in the dashboard and must allow the bot to view the channel, send messages, and attach files.
- Automatic inactivity closure uses the same transcript delivery and deletion flow.

## Operational requirements

- Keep `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, and `SESSION_SECRET` only in hosting environment variables.
- Keep the `data/` directory on persistent hosting storage and excluded from Git.
- The bot needs channel visibility, message sending, attachment, Manage Channels, and appropriate role permissions.
- To include message text in transcripts, enable Message Content Intent in Discord Developer Portal and set `ENABLE_MESSAGE_CONTENT=true` in hosting. Without it, Discord does not provide full message text to the bot.
- File-backed JSON storage is intended for a single bot instance.
- Do not label the system production-ready until panel publishing, permissions, emoji selection, transcript delivery, and deletion have been tested in a real test server.
