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
const configFor = id => {
  const defaults = store.defaultGuildConfig();
  const saved = store.getGuild(id);
  if (!saved) return defaults;
  return {
    ...defaults, ...saved,
    panel: { ...defaults.panel, ...(saved.panel || {}), options: Array.isArray(saved.panel?.options) ? saved.panel.options.slice(0, 5) : defaults.panel.options, components: Array.isArray(saved.panel?.components) ? saved.panel.components : [] },
    transcriptChannelId: saved.transcriptChannelId || null,
    overrideRoleIds: Array.isArray(saved.overrideRoleIds) ? saved.overrideRoleIds : []
  };
};

function normalizeEmoji(value, guild) {
  const raw = clean(value, 100);
  if (!raw) return null;
  const match = raw.match(/^<a?:[a-zA-Z0-9_]+:(\d+)>$/);
  const customId = raw.startsWith("custom:") ? raw.slice(7) : (match ? match[1] : null);
  if (customId) {
    const emoji = guild.emojis.cache.get(customId);
    if (!emoji) throw new Error("الإيموجي المخصص غير موجود في هذا السيرفر.");
    return "<" + (emoji.animated ? "a" : "") + ":" + emoji.name + ":" + emoji.id + ">";
  }
  if (/^<a?:/.test(raw)) throw new Error("صيغة الإيموجي المخصص غير صحيحة.");
  return raw;
}
function emojiObject(value) {
  const raw = String(value || "");
  const match = raw.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  return match ? { id: match[3], name: match[2], animated: Boolean(match[1]) } : (raw ? { name: raw } : undefined);
}
function normalizePanelComponents(input, guild, options) {
  const source = Array.isArray(input) ? input : [];
  if (source.length > 39) throw new Error("وصلت للحد الأقصى لمكونات الرسالة.");
  let textTotal = 0;
  const optionIds = new Set(options.map(o => o.id));
  const normalized = source.map(item => {
    const type = String(item?.type || "");
    if (type === "text") {
      const content = String(item.content || "").trim().slice(0, 4000);
      if (!content) throw new Error("مكوّن Text Display يحتاج نصاً.");
      textTotal += content.length;
      return { id: clean(item.id || crypto.randomUUID(), 40), type, content };
    }
    if (type === "section") {
      const content = String(item.content || "").trim().slice(0, 4000);
      if (!content) throw new Error("مكوّن Section يحتاج نصاً.");
      textTotal += content.length;
      const accessoryType = item.accessoryType === "button" ? "button" : "thumbnail";
      const out = { id: clean(item.id || crypto.randomUUID(), 40), type, content, accessoryType };
      if (accessoryType === "thumbnail") {
        const url = clean(item.url, 2048);
        if (!/^https:\/\//i.test(url)) throw new Error("صورة Section تحتاج رابط https صحيحاً.");
        out.url = url;
        out.description = clean(item.description, 1024);
      } else {
        out.label = clean(item.label, 80);
        out.optionId = clean(item.optionId, 24);
        out.emoji = normalizeEmoji(item.emoji, guild);
        if (!out.label || !optionIds.has(out.optionId)) throw new Error("زر Section يحتاج اسماً ونوع تكت مرتبطاً.");
      }
      return out;
    }
    if (type === "media") {
      const items = (Array.isArray(item.items) ? item.items : []).slice(0, 10).map(media => {
        const url = clean(media.url, 2048);
        if (!/^https:\/\//i.test(url)) throw new Error("كل صورة في Media Gallery تحتاج رابط https صحيحاً.");
        return { url, description: clean(media.description, 1024) };
      });
      if (!items.length) throw new Error("Media Gallery يحتاج صورة واحدة على الأقل.");
      return { id: clean(item.id || crypto.randomUUID(), 40), type, items };
    }
    if (type === "separator") return { id: clean(item.id || crypto.randomUUID(), 40), type, spacing: Number(item.spacing) === 2 ? 2 : 1, divider: item.divider !== false };
    if (type === "button") {
      const label = clean(item.label, 80);
      const style = Math.max(1, Math.min(5, Number(item.style) || 1));
      const emoji = normalizeEmoji(item.emoji, guild);
      if (style === 5) {
        const url = clean(item.url, 512);
        if (!/^https:\/\//i.test(url) || (!label && !emoji)) throw new Error("زر الرابط يحتاج رابط https واسماً أو إيموجياً.");
        return { id: clean(item.id || crypto.randomUUID(), 40), type, label, emoji, style, url };
      }
      const optionId = clean(item.optionId, 24);
      if (!optionIds.has(optionId)) throw new Error("اربط كل زر بنوع تكت.");
      if (!label && !emoji) throw new Error("الزر يحتاج اسماً أو إيموجياً.");
      return { id: clean(item.id || crypto.randomUUID(), 40), type, label, emoji, style, optionId };
    }
    throw new Error("نوع مكوّن غير مدعوم: " + type);
  });
  if (textTotal > 4000) throw new Error("مجموع نصوص الرسالة يتجاوز حد Discord البالغ 4000 حرف.");
  let total = 1, rowOpen = false, rowButtons = 0;
  for (const item of normalized) {
    if (item.type === "button") {
      if (!rowOpen || rowButtons === 5) { total++; rowOpen = true; rowButtons = 0; }
      total++; rowButtons++;
    } else {
      rowOpen = false; rowButtons = 0; total++;
      if (item.type === "section") total += 2;
    }
  }
  if (total > 40) throw new Error("تجاوزت الرسالة حد Discord البالغ 40 مكوّناً.");
  return normalized.map((item, index) => ({ ...item, order: index }));
}
function validateConfig(input, guild) {
  const p = input?.panel || {};
  const options = Array.isArray(p.options) ? p.options : [];
  if (options.length > 5) throw new Error("الحد الأقصى 5 أنواع تكت في اللوحة الواحدة.");
  if (!options.length) throw new Error("أضف نوع تكت واحداً على الأقل.");
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
      label, description: clean(item.description, 100), emoji: normalizeEmoji(item.emoji, guild),
      supportRoleIds, allowedRoleIds, categoryId,
      askReason: Boolean(item.askReason),
      askReasonPrompt: clean(item.askReasonPrompt || "ما سبب فتح التذكرة؟", 120),
      autoCloseMinutes: Math.max(0, Math.min(525600, Number(item.autoCloseMinutes) || 0)),
      channelNameTemplate: clean(item.channelNameTemplate || "ticket-{number}", 90)
    };
  });
  const components = normalizePanelComponents(p.components, guild, normalizedOptions);
  const title = clean(p.title || "مركز الدعم", 250);
  const description = clean(p.description || "", 3500);
  const componentText = components.reduce((sum, item) => sum + (item.content ? item.content.length : 0), 0);
  if (title.length + description.length + componentText > 4000) throw new Error("مجموع نصوص الرسالة يتجاوز حد Discord البالغ 4000 حرف.");
  const transcriptChannelId = guild.channels.cache.get(String(input.transcriptChannelId || ""))?.type === ChannelType.GuildText
    ? String(input.transcriptChannelId) : null;
  return {
    panel: {
      title,
      description,
      components, options: normalizedOptions
    },
    transcriptChannelId,
    overrideRoleIds: (() => {
      const ids = [...new Set((input.overrideRoleIds || []).map(String))].filter(validRole).slice(0, 10);
      const botHighest = guild.members.me?.roles.highest.position || 0;
      if (ids.some(id => guild.roles.cache.get(id).position >= botHighest)) throw new Error("ارفع رتبة البوت فوق رتب التجاوز المختارة.");
      return ids;
    })()
  };
}
function buildV2Component(item) {
  if (item.type === "text") return { type: 10, content: item.content };
  if (item.type === "separator") return { type: 14, spacing: item.spacing, divider: item.divider };
  if (item.type === "media") return { type: 12, items: item.items.map(x => ({ media: { url: x.url }, ...(x.description ? { description: x.description } : {}) })) };
  if (item.type === "section") {
    const accessory = item.accessoryType === "thumbnail"
      ? { type: 11, media: { url: item.url }, ...(item.description ? { description: item.description } : {}) }
      : { type: 2, style: 1, custom_id: "tnxt:open:" + item.optionId, label: item.label, ...(item.emoji ? { emoji: emojiObject(item.emoji) } : {}) };
    return { type: 9, components: [{ type: 10, content: item.content }], accessory };
  }
  if (item.type === "button") {
    return { type: 1, components: [{
      type: 2, style: item.style,
      ...(item.style === 5 ? { url: item.url } : { custom_id: "tnxt:open:" + item.optionId }),
      ...(item.label ? { label: item.label } : {}),
      ...(item.emoji ? { emoji: emojiObject(item.emoji) } : {})
    }] };
  }
  return null;
}
function panelPayload(config) {
  const p = config.panel;
  const configured = Array.isArray(p.components) ? p.components : [];
  const body = [];
  const heading = (p.title || p.description) ? { type: 10, content: (p.title ? "# " + p.title : "") + (p.description ? ((p.title ? "\n" : "") + p.description) : "") } : null;
  if (heading) body.push(heading);
  if (configured.length) {
    for (let i = 0; i < configured.length;) {
      if (configured[i].type === "button") {
        const group = [];
        while (i < configured.length && configured[i].type === "button" && group.length < 5) group.push(configured[i++]);
        body.push({ type: 1, components: group.map(item => ({
          type: 2, style: item.style,
          ...(item.style === 5 ? { url: item.url } : { custom_id: "tnxt:open:" + item.optionId }),
          ...(item.label ? { label: item.label } : {}),
          ...(item.emoji ? { emoji: emojiObject(item.emoji) } : {})
        })) });
      } else {
        body.push(buildV2Component(configured[i++]));
      }
    }
  } else {
    body.push({ type: 1, components: p.options.slice(0, 5).map(o => ({
      type: 2, style: 1, custom_id: "tnxt:open:" + o.id, label: o.label,
      ...(o.emoji ? { emoji: emojiObject(o.emoji) } : {})
    })) });
  }
  return { flags: MessageFlags.IsComponentsV2, components: [{ type: 17, components: body }], allowedMentions: { parse: [] } };
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
  const embed = new EmbedBuilder().setTitle("تذكرة #" + number + " — " + option.label)
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
  let current = store.getTicket(channel.id) || ticket;
  if (current.closedAt) return { closed: true };
  if (!current.closingAt) {
    store.updateTicket(channel.id, { closingAt: Date.now(), closingBy: actorId || "system" });
    await channel.send({ content: "سيتم إغلاق التذكرة خلال 10 ثوانٍ وحفظ نسخة من المحادثة.", allowedMentions: { parse: [] } });
    await new Promise(resolve => setTimeout(resolve, 10_000));
    current = store.getTicket(channel.id) || current;
  }
  const config = configFor(current.guildId);
  const logChannel = config.transcriptChannelId ? await channel.guild.channels.fetch(config.transcriptChannelId).catch(() => null) : null;
  if (!logChannel || !logChannel.isTextBased() || logChannel.id === channel.id) {
    store.updateTicket(channel.id, { closingAt: null });
    throw new Error("حدد قناة سجلات Transcript من لوحة التحكم أولاً.");
  }
  if (!current.transcriptDmSentAt) {
    const dmFile = await transcriptFile(channel, current);
    try {
      const opener = await channel.client.users.fetch(current.userId);
      await opener.send({ content: "نسخة محادثة تذكرتك رقم #" + current.number + " في " + channel.guild.name + ".", files: [dmFile] });
      store.updateTicket(channel.id, { transcriptDmSentAt: Date.now(), transcriptDmError: null });
    } catch (error) {
      store.updateTicket(channel.id, { transcriptDmError: String(error.message || error).slice(0, 200) });
      throw new Error("تعذر إرسال النسخة في الخاص. افتح الخاص مع البوت ثم أعد محاولة الإغلاق؛ لم تُحذف القناة.");
    }
  }
  current = store.getTicket(channel.id) || current;
  if (!current.transcriptLogSentAt) {
    const logFile = await transcriptFile(channel, current);
    const sent = await logChannel.send({
      content: "Transcript التكت #" + current.number + " · العضو: <@" + current.userId + "> · أغلقها: " + (actorId === "system" ? "النظام" : "<@" + actorId + ">"),
      files: [logFile], allowedMentions: { parse: [] }
    });
    store.updateTicket(channel.id, { transcriptLogSentAt: Date.now(), transcriptLogMessageId: sent.id });
  }
  store.updateTicket(channel.id, { closedAt: Date.now(), closedBy: actorId || "system" });
  await channel.delete(automatic ? "TicketNXT auto-close after transcript delivery" : "TicketNXT closed after transcript delivery");
  return { closed: true };
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
    if (!staff) return interaction.reply({ content: "إغلاق التذكرة مخصص للإداريين وفريق الدعم.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await closeTicket(interaction.channel, ticket, interaction.user.id);
    return interaction.editReply({ content: "تم إرسال نسخة المحادثة في الخاص وقناة السجلات وحذف قناة التكت." });
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
        emojis: [...guild.emojis.cache.values()].map(e => ({ id: e.id, name: e.name, animated: e.animated, value: "custom:" + e.id, display: (e.animated ? "GIF " : "") + ":" + e.name + ":" })),
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
      await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.members.fetchMe(), guild.emojis.fetch()]);
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
      const message = String(error?.message || "حدث خطأ أثناء تنفيذ العملية.").slice(0, 1500);
      if (interaction.deferred) await interaction.editReply({ content: message }).catch(() => {});
      else if (!interaction.replied) await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
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
