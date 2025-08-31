const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const { setServerConfig, getServerConfig, getAdminRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("konfiguracja")
    .setDescription(
      "Konfiguruj role dla grup i uczniów (wymaga roli administratora)"
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź czy użytkownik ma rolę administratora z konfiguracji lub jest właścicielem serwera
    const adminRoleName = await getAdminRoleName(interaction.guild.id);
    const hasAdminRole = interaction.member.roles.cache.some(
      (role) => role.name === adminRoleName
    );
    const isOwner = interaction.user.id === interaction.guild.ownerId;

    if (!hasAdminRole && !isOwner) {
      return interaction.reply({
        content: `❌ Ta komenda wymaga roli administratora (**${adminRoleName}**) lub uprawnień właściciela serwera.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Sprawdź czy użytkownik już ma oczekujący proces konfiguracji
    const { hasConfiguration } = require("../state/configuration");
    if (hasConfiguration(interaction.user.id)) {
      return interaction.reply({
        content:
          "Masz już rozpoczęty proces konfiguracji. Sprawdź swoje prywatne wątki.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Utwórz prywatny wątek dla konfiguracji
      const thread = await interaction.channel.threads.create({
        name: `Konfiguracja - ${interaction.user.username}`,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: "Proces konfiguracji ról",
      });

      // Dodaj użytkownika do wątku
      await thread.members.add(interaction.user.id);

      // Rozpocznij proces konfiguracji
      const { startConfiguration } = require("../state/configuration");
      startConfiguration(interaction.user.id, interaction.guild.id, thread.id);

      // Wyślij wiadomość w wątku
      await thread.send(
        `Cześć ${interaction.user}! Rozpoczynam konfigurację ról. Ile grup chcesz skonfigurować? (podaj liczbę od 1 do 50)`
      );

      // Odpowiedz użytkownikowi
      await interaction.reply({
        content: `Utworzono prywatny wątek dla konfiguracji: ${thread}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("[KONFIGURACJA] Błąd przy tworzeniu wątku:", error);
      await interaction.reply({
        content:
          "Wystąpił błąd podczas tworzenia wątku konfiguracyjnego. Spróbuj ponownie lub skontaktuj się z administracją.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
