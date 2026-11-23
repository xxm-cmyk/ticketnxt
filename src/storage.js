const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "state.json");

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ guilds: {}, tickets: {} }, null, 2));
  }
}
function readState() {
  ensure();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { guilds: data.guilds || {}, tickets: data.tickets || {} };
  } catch (error) {
    const backup = DATA_FILE + ".corrupt-" + Date.now();
    try { fs.copyFileSync(DATA_FILE, backup); } catch {}
    throw new Error("TicketNXT data file could not be read; a backup copy was preserved.");
  }
}
function writeState(state) {
  ensure();
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function getGuild(guildId) {
  return readState().guilds[guildId] || null;
}
function saveGuild(guildId, value) {
  const state = readState();
  state.guilds[guildId] = value;
  writeState(state);
  return value;
}
function getTicket(channelId) {
  return readState().tickets[channelId] || null;
}
function saveTicket(channelId, value) {
  const state = readState();
  state.tickets[channelId] = value;
  writeState(state);
  return value;
}
function updateTicket(channelId, patch) {
  const state = readState();
  const current = state.tickets[channelId];
  if (!current) return null;
  state.tickets[channelId] = { ...current, ...patch };
  writeState(state);
  return state.tickets[channelId];
}
function nextTicketNumber(guildId) {
  const state = readState();
  const config = state.guilds[guildId] || defaultGuildConfig();
  config.nextTicketNumber = Number(config.nextTicketNumber || 1);
  const number = config.nextTicketNumber++;
  state.guilds[guildId] = config;
  writeState(state);
  return number;
}
function defaultOption() {
  return {
    id: require("node:crypto").randomUUID().slice(0, 12),
    label: "الدعم الفني",
    description: "تواصل مع فريق الدعم",
    emoji: "🎫",
    supportRoleIds: [],
    allowedRoleIds: [],
    askReason: false,
    askReasonPrompt: "ما سبب فتح التذكرة؟",
    autoCloseMinutes: 0,
    channelNameTemplate: "ticket-{number}"
  };
}
function defaultGuildConfig() {
  return {
    panel: {
      title: "مركز الدعم",
      description: "اختر القسم المناسب لفتح تذكرة جديدة.",
      mode: "embed",
      optionDisplay: "buttons",
      imageUrl: "",
      accentColor: "#5865F2",
      options: [defaultOption()]
    },
    overrideRoleIds: [],
    panelChannelId: null,
    panelMessageId: null,
    nextTicketNumber: 1
  };
}
module.exports = { readState, writeState, getGuild, saveGuild, getTicket, saveTicket, updateTicket, nextTicketNumber, defaultGuildConfig };
