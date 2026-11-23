# TicketNXT — Product Scope

This document records only the features explicitly agreed for the first public release.

## Product direction

TicketNXT is a highly configurable Discord ticket system. Server owners should be able to customize the ticket panel and ticket workflow from a web dashboard with a live preview. Optional features must be independently switchable rather than forced on every server.

## Agreed panel editor

- Live preview while editing.
- Choose between Discord Components V2 and a traditional Embed-style message.
- Choose the presentation style for ticket options: buttons or a select menu.
- Configure the placement/layout of controls within the limits supported by Discord.
- Add optional images and customize message content.
- Configure each ticket option independently.
- Choose an emoji from the server's available custom emojis.
- Configure the support role for each option.
- Configure which roles are allowed to open each option.
- Optional settings should remain optional and disabled features should not appear in the published panel.

## Agreed ticket workflow

- Custom ticket channel naming templates, including variables such as ticket number and username.
- Claiming a ticket.
- After a ticket is claimed, hide it from other staff members while keeping it accessible to staff with explicit override permissions.
- Transfer a ticket between staff members.
- Transcript generation.
- Automatic closure after a configurable period of inactivity.
- Ask the member for the reason for opening the ticket before creating it, and show the answer to staff.
- Each feature above must be optional.

## Configuration principle

Where practical, settings should be configurable per ticket option, so different ticket types can have different roles, prompts, naming rules, and enabled workflow features.

## Not yet decided

- Discord OAuth2 login and dashboard access rules.
- Persistent storage technology and backup strategy.
- Whether a server can publish multiple independent panels.
- Exact behavior and wording for close/reopen, transcript delivery, and transfer notifications.
- Exact Discord message layout options exposed by the editor.
- Final release acceptance checklist and deployment process.

Do not implement undecided behavior as if it were approved. Confirm it before it becomes part of the product.
