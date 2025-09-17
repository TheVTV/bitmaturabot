const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  getAdminRoleName,
  getServerConfig,
  setServerConfig,
} = require("../db/config_mysql");
const { MessageFlags } = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("niezarejestrowany")
    .setDescription(
      "Ustaw rolę dla niezarejestrowanych użytkowników (tylko admin)"
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Tylko administratorzy
    .setContexts([0]),
  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(
      interaction,
      "niezarejestrowany"
    );
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const adminRoleName = await getAdminRoleName(interaction.guild.id);
    const hasAdminRole = interaction.member.roles.cache.some(
      (role) => role.name === adminRoleName
    );
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    if (!hasAdminRole && !isOwner) {
      return await interaction.reply({
        content: `❌ Ta komenda wymaga roli administratora (**${adminRoleName}**) lub uprawnień właściciela serwera.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.reply({
      content: "Podaj ping roli niezarejestrowanych osób (np. @rola):",
      flags: MessageFlags.Ephemeral,
    });

    const filter = (m) => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({
      filter,
      time: 30000,
      max: 1,
    });

    collector.on("collect", async (m) => {
      const role = m.mentions.roles.first();
      if (!role) {
        await interaction.followUp({
          content: "Nie znaleziono roli. Spróbuj ponownie.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      // Zapisz ID roli do configu w bazie MySQL
      const currentConfig = (await getServerConfig(interaction.guild.id)) || {};
      const updatedConfig = {
        ...currentConfig,
        unregisteredRoleId: role.id,
        configuredBy: interaction.user.id,
      };

      const success = await setServerConfig(
        interaction.guild.id,
        updatedConfig
      );

      if (success) {
        await interaction.followUp({
          content: `Rola niezarejestrowanych ustawiona na: <@&${role.id}>`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: "❌ Wystąpił błąd podczas zapisywania konfiguracji.",
          flags: MessageFlags.Ephemeral,
        });
      }
    });
  },
};
