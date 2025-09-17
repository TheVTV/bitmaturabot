const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { performDataSync } = require("../scripts/data-sync-scheduler");
const { checkUserPermissions } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("synchronizuj-dane")
    .setDescription(
      "Ręcznie uruchom synchronizację danych (Szkopuł → Arkusze → Cache)"
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) // Dla nauczycieli i administratorów
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(
      interaction,
      "synchronizuj-dane"
    );
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      await interaction.editReply(
        "[SYNC] Rozpoczynam synchronizację danych..."
      );

      // Uruchom synchronizację
      const syncResult = await performDataSync();

      if (syncResult === false) {
        // Synchronizacja została pominięta bo już trwała
        await interaction.editReply(
          "[SYNC] Synchronizacja już w trakcie - spróbuj ponownie za chwilę."
        );
      } else {
        // Synchronizacja zakończona pomyślnie
        await interaction.editReply(
          "[SYNC] Synchronizacja danych zakończona pomyślnie!"
        );
      }
    } catch (error) {
      console.error("Błąd podczas ręcznej synchronizacji:", error);
      await interaction.editReply(
        "[SYNC] Wystąpił błąd podczas synchronizacji danych."
      );
    }
  },
};
