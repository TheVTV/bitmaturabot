const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getSzkopulIdByDiscordId,
  updateUserSzkopulId,
} = require("../db/users_mysql");

// Mapa do przechowywania aktywnych sesji dodawania szkopul-id
const activeSzkopulSessions = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dodaj-szkopul-id")
    .setDescription("Dodaj swój identyfikator Szkopuł (szkopul.edu.pl)")
    .setDefaultMemberPermissions(null) // Dostępne dla uczniów i wyżej
    .setContexts([0]),
  async execute(interaction) {
    try {
      const discordId = interaction.user.id;

      // Sprawdź czy użytkownik ma już aktywną sesję
      if (activeSzkopulSessions.has(discordId)) {
        return interaction.reply({
          content:
            "Masz już aktywną sesję dodawania Szkopuł ID. Sprawdź swoje prywatne wątki.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Sprawdź czy użytkownik ma już przypisane Szkopuł ID
      const existingSzkopulId = await getSzkopulIdByDiscordId(discordId);

      if (existingSzkopulId) {
        return interaction.reply({
          content: `Masz już przypisany identyfikator Szkopuł: **${existingSzkopulId}**\n\nJeśli chcesz go zmienić, skontaktuj się z administracją.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Utwórz prywatny wątek
      const thread = await interaction.channel.threads.create({
        name: `Szkopuł ID - ${interaction.user.username}`,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: "Dodawanie identyfikatora Szkopuł",
      });

      // Dodaj użytkownika do wątku
      await thread.members.add(interaction.user.id);

      // Zapisz aktywną sesję
      activeSzkopulSessions.set(discordId, {
        threadId: thread.id,
        guildId: interaction.guild.id,
        timestamp: Date.now(),
      });

      // Wyślij instrukcje w wątku
      await thread.send(
        `Cześć ${interaction.user}! 👋\n\n` +
          `Aby dodać swój identyfikator ze strony **szkopul.edu.pl**, podaj go w tym wątku.\n\n` +
          `**Identyfikator powinien:**\n` +
          `• Składać się tylko z cyfr\n` +
          `• Nie zawierać spacji ani innych znaków\n` +
          `• Być Twoim ID z profilu Szkopuł\n\n` +
          `Przykład: \`12345\`\n\n` +
          `Wpisz swój identyfikator poniżej:`
      );

      // Odpowiedz użytkownikowi
      await interaction.reply({
        content: `Utworzono prywatny wątek dla dodania Szkopuł ID: ${thread}`,
        flags: MessageFlags.Ephemeral,
      });

      // Ustaw timeout na 10 minut - jeśli użytkownik nie odpowie, usuń sesję
      setTimeout(() => {
        if (activeSzkopulSessions.has(discordId)) {
          activeSzkopulSessions.delete(discordId);
          thread.send(
            "⏰ Sesja wygasła. Użyj ponownie komendy `/dodaj-szkopul-id` aby spróbować jeszcze raz."
          );

          // Zamknij wątek po 30 sekundach
          setTimeout(() => {
            thread.setArchived(true).catch(console.error);
          }, 30000);
        }
      }, 10 * 60 * 1000); // 10 minut
    } catch (error) {
      console.error("[SZKOPUL-ID] Błąd przy tworzeniu wątku:", error);
      await interaction.reply({
        content:
          "Wystąpił błąd podczas tworzenia wątku. Spróbuj ponownie lub skontaktuj się z administracją.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  // Funkcja do obsługi wiadomości w wątku
  async handleThreadMessage(message) {
    const discordId = message.author.id;
    const session = activeSzkopulSessions.get(discordId);

    if (!session || session.threadId !== message.channel.id) {
      return false; // Nie nasza sesja
    }

    const szkopulId = message.content.trim();

    // Walidacja Szkopuł ID
    if (!this.validateSzkopulId(szkopulId)) {
      await message.reply(
        "❌ **Nieprawidłowy format identyfikatora!**\n\n" +
          "Identyfikator Szkopuł powinien składać się tylko z cyfr (bez spacji i innych znaków).\n\n" +
          "Przykład poprawnego ID: `12345`\n\n" +
          "Spróbuj ponownie:"
      );
      return true;
    }

    try {
      // Zapisz Szkopuł ID do bazy danych
      const success = await updateUserSzkopulId(discordId, szkopulId);

      if (success) {
        await message.reply(
          `✅ **Sukces!**\n\n` +
            `Twój identyfikator Szkopuł został dodany: **${szkopulId}**\n\n` +
            `Możesz teraz zamknąć ten wątek. Dziękujemy! 🎉`
        );

        // Usuń sesję
        activeSzkopulSessions.delete(discordId);

        // Zamknij wątek po 30 sekundach
        setTimeout(() => {
          message.channel.setArchived(true).catch(console.error);
        }, 30000);
      } else {
        await message.reply(
          "❌ **Błąd podczas zapisywania**\n\n" +
            "Nie udało się zapisać identyfikatora do bazy danych. " +
            "Spróbuj ponownie lub skontaktuj się z administracją."
        );
      }
    } catch (error) {
      console.error("[SZKOPUL-ID] Błąd podczas zapisywania:", error);
      await message.reply(
        "❌ **Wystąpił błąd**\n\n" +
          "Nie udało się zapisać identyfikatora. Spróbuj ponownie lub skontaktuj się z administracją."
      );
    }

    return true;
  },

  // Funkcja walidacji Szkopuł ID
  validateSzkopulId(szkopulId) {
    if (!szkopulId || typeof szkopulId !== "string") {
      return false;
    }

    // Usuń białe znaki
    const trimmed = szkopulId.trim();

    // Sprawdź czy składa się tylko z cyfr
    const isNumeric = /^\d+$/.test(trimmed);

    // Sprawdź czy nie jest pusty i ma sensowną długość (1-20 cyfr)
    const hasValidLength = trimmed.length >= 1 && trimmed.length <= 20;

    return isNumeric && hasValidLength;
  },

  // Eksportuj mapę sesji dla innych modułów
  activeSzkopulSessions,
};
