const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const { getAllTeachers } = require("../db/teachers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("potwierdź-usprawiedliwienie")
    .setDescription("Potwierdź usprawiedliwienie nieobecności ucznia (tylko w wątku nieobecności)")
    .setDefaultMemberPermissions(null)
    .setContexts([0]),
  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(interaction, "potwierdź-usprawiedliwienie");
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `❌ **Brak dostępu:** ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      // Sprawdź czy komenda jest używana w wątku nieobecności
      if (!interaction.channel.isThread()) {
        await interaction.reply({
          content: "❌ Ta komenda może być używana tylko w wątkach nieobecności.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Sprawdź czy nazwa wątku zawiera "Nieobecność"
      if (!interaction.channel.name.includes("Nieobecność")) {
        await interaction.reply({
          content: "❌ Ta komenda może być używana tylko w wątkach nieobecności.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Sprawdź czy użytkownik jest prowadzącym
      const teachers = await getAllTeachers();
      const isTeacher = teachers.some(teacher => teacher.discord_id === interaction.user.id);

      if (!isTeacher) {
        await interaction.reply({
          content: "❌ Tylko prowadzący mogą potwierdzać usprawiedliwienia.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Sprawdź czy prowadzący jest członkiem tego wątku
      const threadMember = await interaction.channel.members.fetch(interaction.user.id).catch(() => null);
      if (!threadMember) {
        await interaction.reply({
          content: "❌ Nie jesteś członkiem tego wątku nieobecności.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Potwierdź usprawiedliwienie - wywołaj bezpośrednio funkcję obsługi
      const { handleAbsenceApproval } = require('../utils/absence-handler');
      
      await interaction.reply({
        content: "✅ Przetwarzam potwierdzenie usprawiedliwienia...",
      });

      // Bezpośrednio wywołaj funkcję obsługi zatwierdzenia
      try {
        await handleAbsenceApproval(interaction.channel, interaction.user.id, null, null);
      } catch (approvalError) {
        console.error("Błąd podczas obsługi zatwierdzenia:", approvalError);
        await interaction.editReply({
          content: "❌ Wystąpił błąd podczas zapisywania usprawiedliwienia. Sprawdź logi.",
        });
      }

    } catch (error) {
      console.error("Błąd podczas potwierdzania usprawiedliwienia:", error);
      await interaction.reply({
        content: "❌ Wystąpił błąd podczas przetwarzania potwierdzenia.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};