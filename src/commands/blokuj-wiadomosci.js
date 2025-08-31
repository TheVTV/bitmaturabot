const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const {
  setChannelBlocked,
  getBlockedChannels,
} = require("../state/blockedChannels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blokuj-wiadomosci")
    .setDescription(
      "Blokuje wysyłanie zwykłych wiadomości w wybranych kanałach (tylko komendy są dozwolone)"
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("wlacz")
        .setDescription("Włącz blokowanie wiadomości w wybranych kanałach")
        .addChannelOption((option) =>
          option
            .setName("kanal1")
            .setDescription("Pierwszy kanał do zablokowania")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal2")
            .setDescription("Drugi kanał do zablokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal3")
            .setDescription("Trzeci kanał do zablokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal4")
            .setDescription("Czwarty kanał do zablokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal5")
            .setDescription("Piąty kanał do zablokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("wylacz")
        .setDescription("Wyłącz blokowanie wiadomości w wybranych kanałach")
        .addChannelOption((option) =>
          option
            .setName("kanal1")
            .setDescription("Pierwszy kanał do odblokowania")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal2")
            .setDescription("Drugi kanał do odblokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal3")
            .setDescription("Trzeci kanał do odblokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal4")
            .setDescription("Czwarty kanał do odblokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName("kanal5")
            .setDescription("Piąty kanał do odblokowania (opcjonalny)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lista")
        .setDescription("Pokaż listę zablokowanych kanałów")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts([0]),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (subcommand === "wlacz") {
        // Zbierz wszystkie podane kanały
        const channels = [];
        for (let i = 1; i <= 5; i++) {
          const channel = interaction.options.getChannel(`kanal${i}`);
          if (channel) {
            channels.push(channel);
          }
        }

        // Dodaj kanały do listy zablokowanych
        let addedChannels = [];
        for (const channel of channels) {
          if (setChannelBlocked(guildId, channel.id, true)) {
            addedChannels.push(channel);
          }
        }

        if (addedChannels.length > 0) {
          const channelList = addedChannels
            .map((ch) => `<#${ch.id}>`)
            .join(", ");
          await interaction.reply({
            content:
              `🔒 **Blokowanie wiadomości włączone** w kanałach: ${channelList}\n\n` +
              `ℹ️ Teraz tylko komendy ze znakiem \`/\` będą dozwolone w tych kanałach.`,
            flags: 64, // ephemeral
          });
        } else {
          await interaction.reply({
            content: "⚠️ Wszystkie wybrane kanały były już zablokowane.",
            flags: 64, // ephemeral
          });
        }
      } else if (subcommand === "wylacz") {
        // Zbierz wszystkie podane kanały
        const channels = [];
        for (let i = 1; i <= 5; i++) {
          const channel = interaction.options.getChannel(`kanal${i}`);
          if (channel) {
            channels.push(channel);
          }
        }

        // Usuń kanały z listy zablokowanych
        let removedChannels = [];
        for (const channel of channels) {
          if (setChannelBlocked(guildId, channel.id, false)) {
            removedChannels.push(channel);
          }
        }

        if (removedChannels.length > 0) {
          const channelList = removedChannels
            .map((ch) => `<#${ch.id}>`)
            .join(", ");
          await interaction.reply({
            content: `🔓 **Blokowanie wiadomości wyłączone** w kanałach: ${channelList}`,
            flags: 64, // ephemeral
          });
        } else {
          await interaction.reply({
            content: "⚠️ Żaden z wybranych kanałów nie był zablokowany.",
            flags: 64, // ephemeral
          });
        }
      } else if (subcommand === "lista") {
        const blockedChannels = getBlockedChannels(guildId);

        if (blockedChannels.length === 0) {
          await interaction.reply({
            content:
              "📋 **Brak zablokowanych kanałów**\n\nŻaden kanał nie ma włączonego blokowania wiadomości.",
            flags: 64, // ephemeral
          });
        } else {
          const channelList = blockedChannels
            .map((channelId) => `<#${channelId}>`)
            .join("\n• ");
          await interaction.reply({
            content:
              `📋 **Zablokowane kanały** (${blockedChannels.length}):\n\n• ${channelList}\n\n` +
              `ℹ️ W tych kanałach tylko komendy ze znakiem \`/\` są dozwolone.`,
            flags: 64, // ephemeral
          });
        }
      }
    } catch (error) {
      console.error("[BLOKUJ-WIADOMOSCI] Błąd:", error);

      await interaction.reply({
        content: "❌ Wystąpił błąd podczas zarządzania blokowaniem wiadomości.",
        flags: 64, // ephemeral
      });
    }
  },
};
