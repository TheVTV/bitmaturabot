const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  removeUserByDiscordId,
  getUserByDiscordId,
} = require("../db/users_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("usuń-ucznia")
    .setDescription("Usuń ucznia z systemu i wyrzuć z serwera")
    .addUserOption((option) =>
      option
        .setName("uczeń")
        .setDescription("Uczeń do usunięcia")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("powód")
        .setDescription("Powód usunięcia ucznia")
        .setRequired(true)
        .setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([0]),

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser("uczeń");
      const reason = interaction.options.getString("powód");
      const guild = interaction.guild;

      // Defer reply, bo operacja może potrwać
      await interaction.deferReply({ flags: 64 }); // ephemeral

      // Sprawdź czy target to nie administrator lub sam bot
      if (targetUser.bot) {
        await interaction.editReply({
          content: "❌ Nie można usunąć bota z systemu.",
        });
        return;
      }

      const targetMember = await guild.members
        .fetch(targetUser.id)
        .catch(() => null);
      if (!targetMember) {
        await interaction.editReply({
          content: "❌ Ta osoba nie jest członkiem tego serwera.",
        });
        return;
      }

      // Sprawdź czy target to nie właściciel serwera
      if (targetMember.id === guild.ownerId) {
        await interaction.editReply({
          content: "❌ Nie można usunąć właściciela serwera.",
        });
        return;
      }

      // Sprawdź czy target to nie administrator (jeśli ma uprawnienia administratora)
      if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.editReply({
          content: "❌ Nie można usunąć administratora z systemu.",
        });
        return;
      }

      // Sprawdź czy użytkownik istnieje w bazie danych
      const userData = await getUserByDiscordId(targetUser.id);
      if (!userData) {
        await interaction.editReply({
          content: `❌ Użytkownik ${targetUser.tag} nie jest zarejestrowany w systemie.`,
        });
        return;
      }

      // Przygotuj wiadomość do wysłania na DM
      const dmMessage =
        `🚫 **Zostałeś usunięty z serwera "${guild.name}"**\n\n` +
        `**Powód:** ${reason}\n\n` +
        `**Data:** ${new Date().toLocaleString("pl-PL")}\n\n` +
        `Jeśli uważasz, że to pomyłka, skontaktuj się z administracją serwera.`;

      let dmSent = false;

      // Spróbuj wysłać wiadomość prywatną
      try {
        await targetUser.send(dmMessage);
        dmSent = true;
        console.log(`[USUŃ-UCZNIA] Wysłano DM do ${targetUser.tag}`);
      } catch (error) {
        console.log(
          `[USUŃ-UCZNIA] Nie udało się wysłać DM do ${targetUser.tag}: ${error.message}`
        );
        dmSent = false;
      }

      // Usuń użytkownika z bazy danych
      const dbRemoved = await removeUserByDiscordId(targetUser.id);

      // Wyrzuć użytkownika z serwera
      let kickSuccess = false;
      try {
        await targetMember.kick(
          `Usunięty przez ${interaction.user.tag}: ${reason}`
        );
        kickSuccess = true;
        console.log(`[USUŃ-UCZNIA] Wyrzucono ${targetUser.tag} z serwera`);
      } catch (error) {
        console.error(
          `[USUŃ-UCZNIA] Nie udało się wyrzucić ${targetUser.tag}: ${error.message}`
        );
        kickSuccess = false;
      }

      // Przygotuj raport z wykonanych działań
      let summary = `🔨 **Usunięto ucznia: ${targetUser.tag}**\n\n`;
      summary += `👤 **Użytkownik:** ${targetUser} (${targetUser.id})\n`;
      summary += `📧 **Email:** ${userData.email || "Nieznany"}\n`;
      summary += `🎓 **Grupa:** ${userData.group || "Nieznana"}\n`;
      summary += `📝 **Powód:** ${reason}\n`;
      summary += `👨‍💼 **Wykonane przez:** ${interaction.user}\n\n`;

      summary += `**Status wykonanych działań:**\n`;
      summary += `• ${dbRemoved ? "✅" : "❌"} Usunięcie z bazy danych\n`;
      summary += `• ${dmSent ? "✅" : "❌"} Wysłanie wiadomości prywatnej\n`;
      summary += `• ${kickSuccess ? "✅" : "❌"} Wyrzucenie z serwera\n`;

      if (!dbRemoved || !kickSuccess) {
        summary += `\n⚠️ **Uwaga:** Niektóre operacje nie powiodły się. Sprawdź logi dla szczegółów.`;
      }

      await interaction.editReply({
        content: summary,
      });

      // Loguj działanie
      console.log(
        `[USUŃ-UCZNIA] ${interaction.user.tag} usunął ucznia ${targetUser.tag} z powodu: ${reason}`
      );
    } catch (error) {
      console.error("[USUŃ-UCZNIA] Błąd podczas usuwania ucznia:", error);

      const errorMessage = interaction.deferred ? "editReply" : "reply";

      await interaction[errorMessage]({
        content:
          "❌ Wystąpił błąd podczas usuwania ucznia. Sprawdź logi serwera.",
        flags: 64, // ephemeral
      });
    }
  },
};
