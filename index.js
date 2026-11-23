require("dotenv").config();
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const { Client, GatewayIntentBits, Events, PermissionsBitField } = require("discord.js");

const app = express();
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://ticketnxt.apps.bot-hosting.cloud/auth/discord/callback";
const OAUTH_CONFIGURED = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
let botReady = false;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(session({
  name: "ticketnxt.sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, "public")));

function safeUser(user) {
  return { id: user.id, username: user.username, globalName: user.global_name || user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96` : null };
}
function canManage(guild) {
  if (guild.owner) return true;
  try { return (BigInt(guild.permissions || "0") & PermissionsBitField.Flags.ManageGuild) === PermissionsBitField.Flags.ManageGuild; }
  catch { return false; }
}
function requireLogin(req, res, next) {
  if (!req.session.discordUser) return res.status(401).json({ error: "login_required" });
  next();
}

app.get("/api/status", (_req, res) => res.json({
  bot: botReady ? "online" : "connecting", name: client.user?.tag || null, oauthConfigured: OAUTH_CONFIGURED
}));

app.get("/auth/discord", (req, res) => {
  if (!OAUTH_CONFIGURED) return res.status(503).send("Discord OAuth is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in the hosting environment.");
  const state = crypto.randomBytes(24).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  req.session.oauthState = state;
  req.session.oauthVerifier = verifier;
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI,
    scope: "identify guilds", state, code_challenge: challenge, code_challenge_method: "S256"
  });
  req.session.save(err => err ? res.status(500).send("Could not start Discord login.") : res.redirect(`https://discord.com/oauth2/authorize?${params}`));
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect("/?login=cancelled");
  if (!code || !state || !req.session.oauthState || state !== req.session.oauthState)
    return res.status(400).send("Invalid or expired login state. Return to the dashboard and try again.");
  const verifier = req.session.oauthVerifier;
  delete req.session.oauthState; delete req.session.oauthVerifier;
  try {
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code", code: String(code), redirect_uri: REDIRECT_URI, code_verifier: verifier })
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) {
      console.error("OAuth token exchange failed:", token.error || tokenRes.status);
      return res.status(401).send("Discord login could not be completed. Please try again.");
    }
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const [userRes, guildsRes] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", { headers }),
      fetch("https://discord.com/api/v10/users/@me/guilds", { headers })
    ]);
    if (!userRes.ok || !guildsRes.ok) return res.status(401).send("Could not read your Discord account permissions.");
    const [user, guilds] = await Promise.all([userRes.json(), guildsRes.json()]);
    req.session.discordUser = safeUser(user);
    req.session.manageableGuilds = guilds.filter(canManage).map(g => ({
      id: g.id, name: g.name, owner: Boolean(g.owner),
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96` : null,
      botInstalled: client.guilds.cache.has(g.id)
    }));
    req.session.selectedGuildId = null;
    req.session.save(err => err ? res.status(500).send("Could not save your login session.") : res.redirect("/"));
  } catch (err) {
    console.error("Discord OAuth callback failed:", err);
    res.status(500).send("Discord login failed unexpectedly. Please try again.");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.discordUser) return res.json({ authenticated: false, oauthConfigured: OAUTH_CONFIGURED });
  res.json({ authenticated: true, user: req.session.discordUser, guilds: req.session.manageableGuilds || [],
    selectedGuildId: req.session.selectedGuildId || null, oauthConfigured: OAUTH_CONFIGURED });
});
app.post("/api/select-guild", requireLogin, (req, res) => {
  const id = String(req.body?.guildId || "");
  const guild = (req.session.manageableGuilds || []).find(g => g.id === id);
  if (!guild) return res.status(403).json({ error: "guild_not_allowed" });
  if (!guild.botInstalled || !client.guilds.cache.has(id)) return res.status(409).json({ error: "bot_not_in_guild" });
  req.session.selectedGuildId = id;
  req.session.save(err => err ? res.status(500).json({ error: "session_save_failed" }) : res.json({ ok: true, selectedGuildId: id }));
});
app.post("/auth/logout", (req, res) => req.session.destroy(() => {
  res.clearCookie("ticketnxt.sid", { httpOnly: true, sameSite: "lax", secure: true });
  res.json({ ok: true });
}));

app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`TicketNXT dashboard listening on port ${PORT}`));

if (!process.env.DISCORD_TOKEN) { console.error("Missing DISCORD_TOKEN in environment variables."); process.exit(1); }
client.once(Events.ClientReady, ready => { botReady = true; console.log(`Logged in as ${ready.user.tag}`); });
client.login(process.env.DISCORD_TOKEN).catch(err => { console.error("Failed to log in to Discord:", err); process.exit(1); });
