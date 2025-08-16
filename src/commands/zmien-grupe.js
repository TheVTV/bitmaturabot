const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { addPending } = require("../state/pending");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("zmień-grupę")
    .setDescription("Zmień grupę użytkownika - tylko dla administratorów")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    // Sprawdź czy użytkownik ma uprawnienia administratora
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ Nie masz uprawnień do używania tej komendy. Wymagane uprawnienia administratora.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Sprawdź czy użytkownik już ma aktywny proces zmiany grupy
    const { hasPendingType } = require("../state/pending");
    if (hasPendingType(interaction.user.id, "group_change")) {
      return interaction.reply({
        content: "Masz już rozpoczęty proces zmiany grupy. Sprawdź swoje prywatne wątki.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Utwórz prywatny wątek
      const thread = await interaction.channel.threads.create({
        name: `Zmiana grupy - ${interaction.user.username}`,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: "Proces zmiany grupy użytkownika",
      });

      // Dodaj użytkownika do wątku
      await thread.members.add(interaction.user.id);

      // Zapisz oczekiwanie ze stanem zmiany grupy
      addPending(interaction.user.id, {
        type: "group_change",
        guildId: interaction.guild.id,
        step: "email",
        threadId: thread.id,
      });

      // Wyślij wiadomość w wątku
      await thread.send(
        `🔄 **Zmiana grupy użytkownika**\n\n` +
        `Cześć ${interaction.user}! Aby zmienić grupę użytkownika, podaj proszę adres e-mail osoby, której grupę chcesz zmienić.\n\n` +
        `💡 **Przykład:** jan.kowalski@example.com`
      );

      // Odpowiedz użytkownikowi
      await interaction.reply({
        content: `Utworzono prywatny wątek dla zmiany grupy: ${thread}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("[ZMIANA GRUPY] Błąd przy tworzeniu wątku:", error);
      await interaction.reply({
        content: "Wystąpił błąd podczas tworzenia wątku dla zmiany grupy. Spróbuj ponownie lub skontaktuj się z administracją.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
