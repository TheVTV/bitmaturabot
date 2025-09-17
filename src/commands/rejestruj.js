const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const { addPending } = require("../state/pending");
const { checkUserPermissions } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rejestruj")
    .setDescription("Rozpocznij proces rejestracji i weryfikacji e-maila")
    .setDefaultMemberPermissions(null) // Dostępne dla wszystkich, nawet niezarejestrowanych
    .setContexts([0]),
  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(interaction, "rejestruj");
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Sprawdź czy użytkownik już ma rolę "uczeń"
    const hasStudentRole = interaction.member.roles.cache.some(
      (role) => role.name.toLowerCase() === "uczeń"
    );

    if (hasStudentRole) {
      // Usuń rolę niezarejestrowany jeśli istnieje
      const { getUnregisteredRoleId } = require("../db/config_mysql");
      const unregisteredRoleId = await getUnregisteredRoleId(
        interaction.guild.id
      );
      if (unregisteredRoleId) {
        const unregRole = interaction.guild.roles.cache.get(unregisteredRoleId);
        if (unregRole && interaction.member.roles.cache.has(unregRole.id)) {
          await interaction.member.roles.remove(
            unregRole,
            "Użytkownik zarejestrowany"
          );
        }
      }
      return interaction.reply({
        content: "Jesteś już zarejestrowany!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Sprawdź czy użytkownik już ma oczekujący proces rejestracji
    const { hasPending } = require("../state/pending");
    if (hasPending(interaction.user.id)) {
      return interaction.reply({
        content:
          "Masz już rozpoczęty proces rejestracji. Sprawdź swoje prywatne wątki.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Utwórz prywatny wątek
      const thread = await interaction.channel.threads.create({
        name: `Rejestracja - ${interaction.user.username}`,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: "Proces rejestracji użytkownika",
      });

      // Dodaj użytkownika do wątku
      await thread.members.add(interaction.user.id);

      // Zapisz oczekiwanie
      addPending(interaction.user.id, interaction.guild.id);

      // Wyślij wiadomość w wątku
      await thread.send(
        `Cześć ${interaction.user}! Podaj proszę adres e-mail użyty w rejestracji, aby nadać odpowiednie role.`
      );

      // Odpowiedz użytkownikowi
      await interaction.reply({
        content: `Utworzono prywatny wątek dla Twojej rejestracji: ${thread}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("[REJESTRACJA] Błąd przy tworzeniu wątku:", error);
      await interaction.reply({
        content:
          "Wystąpił błąd podczas tworzenia wątku rejestracyjnego. Spróbuj ponownie lub skontaktuj się z administracją.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
