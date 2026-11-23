const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder, ChannelType, PermissionFlagsBits, MessageFlags, Events
} = require("discord.js");
const crypto = require("node:crypto");
const store = require("./storage");

const clean = (v, n = 100) => String(v ?? "").trim().slice(0, n);
const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hasAny = (member, ids = []) => ids.some(id => member?.roles?.cache?.has(id) || (Array.isArray(member?.roles) && member.roles.includes(id)));
const hasPermission = (member, flag) => {
  try {
    if (member?.permissions?.has) return member.permissions.has(flag);
    return (BigInt(member?.permissions || "0") & flag) === flag;
  } catch { return false; }
};
const manager = member => hasPermission(member, PermissionFlagsBits.ManageGuild) || hasPermission(member, PermissionFlagsBits.Administrator);
const configFor = id => store.getGuild(id) || store.defaultGuildConfig();

function validateConfig(input, guild) {
  const p = input?.panel || {};
  const options = Array.isArray(p.options) ? p.options.slice(0, 25) : [];
  if (!options.length) throw new Error("أضف خيار تكت واحداً على الأقل.");
  const validRole = id => guild.roles.cache.has(String(id));
  const normalizedOptions = options.map(item => {
    const label = clean(item.label, 80);
    if (!label) throw new Error("اسم كل خيار مطلوب.");
    const supportRoleIds = [...new Set((item.supportRoleIds || []).map(String))].filter(validRole).slice(0, 10);
    const botHighest = guild.members.me?.roles.highest.position || 0;
    if (supportRoleIds.some(id => guild.roles.cache.get(id).position >= botHighest)) throw new Error("ارفع رتبة البوت فوق رتب الدعم المختارة.");
    const allowedRoleIds = [...new Set((item.allowedRoleIds || []).map(String))].filter(validRole).slice(0, 10);
    const categoryId = guild.channels.cache.get(String(item.categoryId || ""))?.type === ChannelType.GuildCategory ? String(item.categoryId) : null;
    return {
      id: /^[a-zA-Z0-9_-]{1,24}$/.test(String(item.id || "")) ? String(item.id) : crypto.randomBytes(6).toString("hex"),
      label, description: clean(item.description, 100), emoji: clean(item.emoji, 80),
      supportRoleIds, allowedRoleIds, categoryId,
      askReason: Boolean(item.askReason),
      askReasonPrompt: clean(item.askReasonPrompt || "ما سبب فتح التذكرة؟", 120),
      autoCloseMinutes: Math.max(0, Math.min(525600, Number(item.autoCloseMinutes) || 0)),
      channelNameTemplate: clean(item.channelNameTemplate || "ticket-{number}", 90)
    };
  });
  const imageUrl = clean(p.imageUrl, 500);
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new Error("رابط الصورة يجب أن يبدأ بـ https://");
  const color = /^#[0-9a-fA-F]{6}$/.test(p.accentColor || "") ? p.accentColor : "#5865F2";
  return {
    panel: {
      title: clean(p.title || "مركز الدعم", 250),
      description: clean(p.description || "اختر القسم المناسب لفتح تذكرة جديدة.", 3500),
      mode: p.mode === "components" ? "components" : "embed",
      optionDisplay: p.optionDisplay === "select" ? "select" : "buttons",
      imageUrl, accentColor: color, options: normalizedOptions
    },
    overrideRoleIds: (() => {
      const ids = [...new Set((input.overrideRoleIds || []).map(String))].filter(validRole).slice(0, 10);
      const botHighest = guild.members.me?.roles.highest.position || 0;
      if (ids.some(id => guild.roles.cache.get(id).position >= botHighest)) throw new Error("ارفع رتبة البوت فوق رتب التجاوز المختارة.");
      return ids;
    })()
  };
}
function rowsForOptions(options) {
  const rows = [];
  for (let i = 0; i < options.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(options.slice(i, i + 5).map(o => {
      const b = new ButtonBuilder().setCustomId("tnxt:open:" + o.id).setLabel(o.label).setStyle(ButtonStyle.Primary);
      if (o.emoji) { try { b.setEmoji(o.emoji); } catch {} }
      return b;
    })));
  }
  return rows;
}
function panelPayload(config) {
  const p = config.panel;
  const rows = p.optionDisplay === "select"
    ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId("tnxt:select").setPlaceholder("اختر نوع التذكرة")
        .addOptions(p.options.map(o => ({
          label: o.label, value: o.id, description: o.description || "فتح تذكرة جديدة",
          ...(o.emoji ? { emoji: o.emoji } : {})
        }))))]
    : rowsForOptions(p.options);
  if (p.mode === "components") {
    const body = [{ type: 10, content: "# " + p.title + (p.description ? "\n" + p.description : "") }];
    if (p.imageUrl) body.push({ type: 12, items: [{ media: { url: p.imageUrl } }] });
    body.push(...rows.map(r => r.toJSON()));
    return { flags: MessageFlags.IsComponentsV2, components: [{ type: 17, accent_color: parseInt(p.accentColor.slice(1), 16), components: body }], allowedMentions: { parse: [] } };
  }
  const embed = new EmbedBuilder().setColor(p.accentColor).setTitle(p.title).setDescription(p.description || "اختر أحد الأقسام لفتح تذكرة.");
  if (p.imageUrl) embed.setImage(p.imageUrl);
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}
function ticketRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("tnxt:claim").setLabel("استلام").setEmoji("🙋").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tnxt:transfer").setLabel("تحويل").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("tnxt:close").setLabel("إغلاق").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  )];
}
function canOpen(member, option) {
  return !option.allowedRoleIds.length || hasAny(member, option.allowedRoleIds) || manager(member);
}
function canStaff(member, ticket, config) {
  const option = config.panel.options.find(o => o.id === ticket.optionId);
  return manager(member) || hasAny(member, ticket.overrideRoleIds || config.overrideRoleIds) ||
    hasAny(member, ticket.supportRoleIds || option?.supportRoleIds || []);
}
async function createTicket(interaction, option, reason) {
  const guild = interaction.guild;
  const config = configFor(guild.id);
  if (!canOpen(interaction.member, option))
    return interaction.reply({ content: "ليس لديك رتبة تسمح بفتح هذا النوع من التذاكر.", flags: MessageFlags.Ephemeral });
  const open = Object.values(store.readState().tickets).find(t => t.guildId === guild.id && t.userId === interaction.user.id && !t.closedAt);
  if (open) return interaction.reply({ content: "لديك تذكرة مفتوحة بالفعل: <#" + open.channelId + ">", flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const number = store.nextTicketNumber(guild.id);
  const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || "member";
  const raw = option.channelNameTemplate.replace(/\{number\}/g, String(number)).replace(/\{username\}/g, username).replace(/\{user\}/g, username);
  const channelName = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "ticket-" + number;
  const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [...allow, PermissionFlagsBits.AttachFiles] },
    { id: interaction.client.user.id, allow: [...allow, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] }
  ];
  for (const id of new Set([...option.supportRoleIds, ...config.overrideRoleIds]))
    if (guild.roles.cache.has(id)) overwrites.push({ id, allow });
  const createOptions = { name: channelName, type: ChannelType.GuildText, permissionOverwrites: overwrites, reason: "TicketNXT ticket #" + number };
  const category = option.categoryId && guild.channels.cache.get(option.categoryId);
  if (category?.type === ChannelType.GuildCategory) createOptions.parent = category.id;
  const channel = await guild.channels.create(createOptions);
  const ticket = {
    guildId: guild.id, channelId: channel.id, userId: interaction.user.id, optionId: option.id,
    optionLabel: option.label, number, reason: clean(reason, 1000), claimedBy: null,
    supportRoleIds: [...option.supportRoleIds], overrideRoleIds: [...config.overrideRoleIds],
    autoCloseMinutes: Number(option.autoCloseMinutes || 0),
    openedAt: Date.now(), lastActivityAt: Date.now(), closedAt: null
  };
  store.saveTicket(channel.id, ticket);
  const embed = new EmbedBuilder().setColor("#5865F2").setTitle("تذكرة #" + number + " — " + option.label)
    .setDescription("أهلاً <@" + interaction.user.id + ">، وصلنا طلبك وسيقوم فريق الدعم بالرد عليك.")
    .addFields(
      { name: "صاحب التذكرة", value: "<@" + interaction.user.id + ">", inline: true },
      { name: "القسم", value: option.label, inline: true },
      ...(ticket.reason ? [{ name: "سبب فتح التذكرة", value: ticket.reason }] : [])
    ).setTimestamp();
  await channel.send({ content: "<@" + interaction.user.id + ">", embeds: [embed], components: ticketRows(), allowedMentions: { users: [interaction.user.id] } });
  await interaction.editReply({ content: "تم إنشاء تذكرتك: " + channel.toString() });
}
async function transcriptFile(channel, ticket) {
  const messages = [];
  let before;
  for (let i = 0; i < 10; i++) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!page.size) break;
    messages.push(...page.values());
    before = page.last().id;
    if (page.size < 100) break;
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const rows = messages.map(m => {
    const links = [...m.attachments.values()].map(a => '<a href="' + escapeHtml(a.url) + '">مرفق</a>').join(" · ");
    return '<article><header>' + escapeHtml(m.author?.tag || "مستخدم") + ' — ' + escapeHtml(new Date(m.createdTimestamp).toLocaleString("ar-SA")) +
      '</header><p>' + escapeHtml(m.content || (m.embeds.length ? "[رسالة تحتوي على Embed]" : "")) +
      (links ? '<div>' + links + '</div>' : "") + '</p></article>';
  }).join("\n");
  const contentNotice = process.env.ENABLE_MESSAGE_CONTENT === "true" ? "" : '<p><strong>تنبيه:</strong> محتوى الرسائل غير مضمّن. فعّل Message Content Intent في Discord Developer Portal ثم ENABLE_MESSAGE_CONTENT في الاستضافة لإظهار نصوص الرسائل.</p>';
  const html = '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>Transcript #' + ticket.number +
    '</title><style>body{font:15px system-ui;background:#11131a;color:#eee;max-width:900px;margin:35px auto;padding:0 18px}article{padding:14px;border:1px solid #303443;border-radius:10px;margin:10px 0;overflow-wrap:anywhere}header{color:#9ca7ff;font-weight:bold}p{white-space:pre-wrap}</style><h1>TicketNXT — Transcript #' +
    ticket.number + '</h1><p>القسم: ' + escapeHtml(ticket.optionLabel) + ' · العضو: ' + escapeHtml(ticket.userId) + '</p>' + contentNotice + rows + '</html>';
  return new AttachmentBuilder(Buffer.from(html, "utf8"), { name: "ticket-" + ticket.number + "-transcript.html" });
}
async function closeTicket(channel, ticket, actorId, automatic = false) {
  const current = store.getTicket(channel.id) || ticket;
  if (current.closedAt) return;
  if (!current.transcriptMessageId) {
    const file = await transcriptFile(channel, current);
    const sent = await channel.send({
      content: automatic ? "أُغلقت التذكرة تلقائياً بسبب عدم النشاط." : "تم إغلاق التذكرة.",
      files: [file], allowedMentions: { parse: [] }
    });
    store.updateTicket(channel.id, { transcriptMessageId: sent.id });
  }
  await channel.permissionOverwrites.edit(current.userId, { ViewChannel: false, SendMessages: false });
  if (!channel.name.startsWith("closed-")) await channel.setName(("closed-" + channel.name).slice(0, 100)).catch(() => {});
  store.updateTicket(channel.id, { closedAt: Date.now(), closedBy: actorId || "system" });
}
async function showReasonModal(interaction, option) {
  const modal = new ModalBuilder().setCustomId("tnxt:reason:" + option.id).setTitle("فتح تذكرة");
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("reason").setLabel(option.askReasonPrompt.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
  ));
  return interaction.showModal(modal);
}
async function handleInteraction(interaction) {
  if (!interaction.inGuild()) return;
  if (interaction.isModalSubmit() && interaction.customId.startsWith("tnxt:transfer:")) {
    const channelId = interaction.customId.split(":")[2];
    const ticket = store.getTicket(channelId);
    if (!ticket || ticket.closedAt) return interaction.reply({ content: "التذكرة غير متاحة.", flags: MessageFlags.Ephemeral });
    const config = configFor(interaction.guildId);
    if (ticket.claimedBy !== interaction.user.id && !manager(interaction.member) && !hasAny(interaction.member, config.overrideRoleIds))
      return interaction.reply({ content: "فقط مستلم التذكرة أو رتبة التجاوز يمكنها تحويلها.", flags: MessageFlags.Ephemeral });
    const targetId = interaction.fields.getTextInputValue("target").replace(/[<@!>]/g, "").trim();
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    const option = config.panel.options.find(o => o.id === ticket.optionId);
    if (!target || !(manager(target) || hasAny(target, ticket.overrideRoleIds || config.overrideRoleIds) || hasAny(target, ticket.supportRoleIds || option?.supportRoleIds || [])))
      return interaction.reply({ content: "لم أجد عضواً لديه رتبة دعم مناسبة. تحقق من المعرّف والرتب.", flags: MessageFlags.Ephemeral });
    const channel = await interaction.guild.channels.fetch(channelId);
    if (ticket.claimedBy) await channel.permissionOverwrites.delete(ticket.claimedBy).catch(() => {});
    if (ticket.claimedBy === ticket.userId) await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    store.updateTicket(channelId, { claimedBy: target.id });
    await interaction.reply({ content: "تم تحويل التذكرة إلى <@" + target.id + ">.", flags: MessageFlags.Ephemeral });
    await channel.send({ content: "تم تحويل التذكرة إلى <@" + target.id + ">.", allowedMentions: { users: [target.id] } });
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith("tnxt:reason:")) {
    const option = configFor(interaction.guildId).panel.options.find(o => o.id === interaction.customId.split(":")[2]);
    if (!option) return interaction.reply({ content: "هذا القسم لم يعد متاحاً.", flags: MessageFlags.Ephemeral });
    return createTicket(interaction, option, interaction.fields.getTextInputValue("reason"));
  }
  if (interaction.isButton() && interaction.customId.startsWith("tnxt:open:")) {
    const option = configFor(interaction.guildId).panel.options.find(o => o.id === interaction.customId.split(":")[2]);
    if (!option) return interaction.reply({ content: "هذا الخيار لم يعد متاحاً.", flags: MessageFlags.Ephemeral });
    if (!canOpen(interaction.member, option)) return interaction.reply({ content: "ليس لديك صلاحية فتح هذا القسم.", flags: MessageFlags.Ephemeral });
    return option.askReason ? showReasonModal(interaction, option) : createTicket(interaction, option, "");
  }
  if (interaction.isStringSelectMenu() && interaction.customId === "tnxt:select") {
    const option = configFor(interaction.guildId).panel.options.find(o => o.id === interaction.values[0]);
    if (!option) return interaction.reply({ content: "هذا الخيار لم يعد متاحاً.", flags: MessageFlags.Ephemeral });
    if (!canOpen(interaction.member, option)) return interaction.reply({ content: "ليس لديك صلاحية فتح هذا القسم.", flags: MessageFlags.Ephemeral });
    return option.askReason ? showReasonModal(interaction, option) : createTicket(interaction, option, "");
  }
  if (!interaction.isButton() || !["tnxt:claim", "tnxt:transfer", "tnxt:close"].includes(interaction.customId)) return;
  const ticket = store.getTicket(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "لم أجد بيانات هذه التذكرة.", flags: MessageFlags.Ephemeral });
  if (ticket.closedAt) return interaction.reply({ content: "هذه التذكرة مغلقة بالفعل.", flags: MessageFlags.Ephemeral });
  const config = configFor(interaction.guildId);
  const option = config.panel.options.find(o => o.id === ticket.optionId);
  const roles = ticket.supportRoleIds || option?.supportRoleIds || [];
  const staff = canStaff(interaction.member, ticket, config);
  if (interaction.customId === "tnxt:close") {
    if (interaction.user.id !== ticket.userId && !staff) return interaction.reply({ content: "ليس لديك صلاحية إغلاق هذه التذكرة.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await closeTicket(interaction.channel, ticket, interaction.user.id);
    return interaction.editReply({ content: "تم إغلاق التذكرة وإرفاق الـ Transcript." });
  }
  if (!staff) return interaction.reply({ content: "هذا الإجراء مخصص لفريق الدعم.", flags: MessageFlags.Ephemeral });
  if (interaction.customId === "tnxt:claim") {
    if (ticket.claimedBy) return interaction.reply({ content: "التذكرة مستلمة بالفعل.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      for (const roleId of roles) await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: false });
      for (const roleId of (ticket.overrideRoleIds || config.overrideRoleIds))
        await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      store.updateTicket(interaction.channelId, { claimedBy: interaction.user.id });
      await interaction.channel.send({ content: "تم استلام التذكرة بواسطة <@" + interaction.user.id + ">.", allowedMentions: { users: [interaction.user.id] } });
      return interaction.editReply({ content: "تم استلام التذكرة، وأصبحت مخفية عن بقية فريق الدعم." });
    } catch (error) {
      for (const roleId of roles) await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: true }).catch(() => {});
      if (interaction.user.id === ticket.userId)
        await interaction.channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
      else await interaction.channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
      throw error;
    }
  }
  if (interaction.customId === "tnxt:transfer") {
    if (!ticket.claimedBy) return interaction.reply({ content: "استلم التذكرة أولاً.", flags: MessageFlags.Ephemeral });
    if (ticket.claimedBy !== interaction.user.id && !manager(interaction.member) && !hasAny(interaction.member, config.overrideRoleIds))
      return interaction.reply({ content: "فقط المستلم أو رتبة التجاوز يمكنها تحويل التذكرة.", flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId("tnxt:transfer:" + interaction.channelId).setTitle("تحويل التذكرة");
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("target").setLabel("معرّف العضو أو منشنه")
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
    ));
    return interaction.showModal(modal);
  }
}
function registerTicketSystem(app, client, requireLogin) {
  app.get("/api/ticket/meta", requireLogin, async (req, res) => {
    try {
      const id = req.session.selectedGuildId;
      if (!id || !(req.session.manageableGuilds || []).some(g => g.id === id)) return res.status(403).json({ error: "guild_not_selected" });
      const guild = await client.guilds.fetch(id);
      await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
      await guild.emojis.fetch().catch(() => null);
      const config = configFor(id);
      res.json({
        guild: { id: guild.id, name: guild.name },
        roles: [...guild.roles.cache.values()].filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
        emojis: [...guild.emojis.cache.values()].map(e => ({ id: e.id, name: e.name, value: "<" + (e.animated ? "a" : "") + ":" + e.name + ":" + e.id + ">" })),
        channels: [...guild.channels.cache.values()].filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: c.name })),
        categories: [...guild.channels.cache.values()].filter(c => c.type === ChannelType.GuildCategory).map(c => ({ id: c.id, name: c.name })),
        config
      });
    } catch (error) { console.error("Ticket meta failed:", error); res.status(500).json({ error: "meta_load_failed" }); }
  });
  app.put("/api/ticket/config", requireLogin, async (req, res) => {
    try {
      const id = req.session.selectedGuildId;
      if (!id || !(req.session.manageableGuilds || []).some(g => g.id === id)) return res.status(403).json({ error: "guild_not_selected" });
      const guild = await client.guilds.fetch(id);
      await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.members.fetchMe()]);
      const member = await guild.members.fetch(req.session.discordUser.id);
      if (!manager(member)) return res.status(403).json({ error: "manage_guild_required" });
      const previous = configFor(id);
      const normalized = validateConfig(req.body, guild);
      normalized.panelChannelId = previous.panelChannelId;
      normalized.panelMessageId = previous.panelMessageId;
      normalized.nextTicketNumber = previous.nextTicketNumber || 1;
      store.saveGuild(id, normalized);
      res.json({ ok: true, config: normalized });
    } catch (error) { res.status(400).json({ error: error.message || "invalid_config" }); }
  });
  app.post("/api/ticket/publish", requireLogin, async (req, res) => {
    try {
      const id = req.session.selectedGuildId;
      if (!id || !(req.session.manageableGuilds || []).some(g => g.id === id)) return res.status(403).json({ error: "guild_not_selected" });
      const guild = await client.guilds.fetch(id);
      const member = await guild.members.fetch(req.session.discordUser.id);
      if (!manager(member)) return res.status(403).json({ error: "manage_guild_required" });
      const channel = await guild.channels.fetch(String(req.body.channelId || ""));
      if (!channel || channel.type !== ChannelType.GuildText) return res.status(400).json({ error: "invalid_channel" });
      const perms = channel.permissionsFor(client.user);
      if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels]))
        return res.status(403).json({ error: "bot_missing_permissions" });
      const config = configFor(id);
      const payload = panelPayload(config);
      const oldChannel = config.panelChannelId ? await guild.channels.fetch(config.panelChannelId).catch(() => null) : null;
      const oldMessage = oldChannel?.isTextBased() && config.panelMessageId
        ? await oldChannel.messages.fetch(config.panelMessageId).catch(() => null) : null;
      const message = await channel.send(payload);
      if (oldMessage) await oldMessage.delete().catch(() => {});
      config.panelChannelId = channel.id;
      config.panelMessageId = message.id;
      store.saveGuild(id, config);
      res.json({ ok: true, channelId: channel.id, messageId: message.id, url: message.url });
    } catch (error) { console.error("Panel publish failed:", error); res.status(500).json({ error: error.message || "publish_failed" }); }
  });
  client.on(Events.InteractionCreate, interaction => handleInteraction(interaction).catch(async error => {
    console.error("Ticket interaction failed:", error);
    if (interaction.isRepliable()) {
      if (interaction.deferred) await interaction.editReply({ content: "حدث خطأ أثناء تنفيذ العملية. تحقق من صلاحيات البوت وحاول مرة أخرى." }).catch(() => {});
      else if (!interaction.replied) await interaction.reply({ content: "حدث خطأ أثناء تنفيذ العملية. تحقق من صلاحيات البوت وحاول مرة أخرى.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }));
  client.on(Events.MessageCreate, message => {
    if (!message.guild || message.author.bot) return;
    const ticket = store.getTicket(message.channelId);
    if (ticket && !ticket.closedAt) store.updateTicket(message.channelId, { lastActivityAt: Date.now() });
  });
  client.on(Events.ChannelDelete, channel => {
    const ticket = store.getTicket(channel.id);
    if (ticket && !ticket.closedAt) store.updateTicket(channel.id, { closedAt: Date.now(), closedBy: "channel-deleted" });
  });
  const timer = setInterval(async () => {
    try {
      for (const ticket of Object.values(store.readState().tickets)) {
        if (ticket.closedAt) continue;
        const minutes = Number(ticket.autoCloseMinutes || 0);
        if (!minutes || Date.now() - Number(ticket.lastActivityAt || ticket.openedAt) < minutes * 60000) continue;
        const guild = await client.guilds.fetch(ticket.guildId);
        const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
        if (channel) await closeTicket(channel, ticket, "system", true);
      }
    } catch (error) { console.error("Auto close check failed:", error.message); }
  }, 60_000);
  timer.unref();
}
module.exports = { registerTicketSystem, panelPayload, validateConfig };
