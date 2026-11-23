require("dotenv").config();

const path = require("node:path");
const express = require("express");
const { Client, GatewayIntentBits, Events } = require("discord.js");

const app = express();
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3000);

let botReady = false;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({
    bot: botReady ? "online" : "connecting",
    name: client.user?.tag || null
  });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TicketNXT dashboard listening on port ${PORT}`);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  botReady = true;
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content === "!ping") {
    await message.reply("Pong!");
  }
});

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to log in to Discord:", error);
  process.exit(1);
});
