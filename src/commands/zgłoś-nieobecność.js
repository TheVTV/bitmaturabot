const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const { getUserByDiscordId } = require("../db/users_mysql");
const { getAllTeachers } = require("../db/teachers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("zgłoś-nieobecność")
    .setDescription("Zgłoś nieobecność do prowadzącego grupy")
    .setDefaultMemberPermissions(null)
    .setContexts([0]),
  async execute(interaction) {
    try {
      // NATYCHMIAST pokaż modal - bez żadnych sprawdzeń
      // Wszystkie sprawdzenia będą wykonane po przesłaniu modala
      const modal = new ModalBuilder()
        .setCustomId(`absence_report_${interaction.user.id}`)
        .setTitle("Zgłoszenie nieobecności");

      const reasonInput = new TextInputBuilder()
        .setCustomId("absence_reason")
        .setLabel("Powód nieobecności")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Opisz powód swojej nieobecności...")
        .setRequired(true)
        .setMaxLength(1000);

      // Trzy oddzielne pola na datę
      const dayInput = new TextInputBuilder()
        .setCustomId("absence_day")
        .setLabel("Dzień (1-31)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("np. 19")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2);

      const monthInput = new TextInputBuilder()
        .setCustomId("absence_month")
        .setLabel("Miesiąc (1-12)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("np. 9")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2);

      const yearInput = new TextInputBuilder()
        .setCustomId("absence_year")
        .setLabel("Rok")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("np. 2025")
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(4);

      const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
      const secondActionRow = new ActionRowBuilder().addComponents(dayInput);
      const thirdActionRow = new ActionRowBuilder().addComponents(monthInput);
      const fourthActionRow = new ActionRowBuilder().addComponents(yearInput);

      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

      await interaction.showModal(modal);

      // Wszystkie sprawdzenia (role, baza danych, prowadzący) będą wykonane w absence-handler.js

    } catch (error) {
      console.error("Błąd podczas tworzenia zgłoszenia nieobecności:", error);
      
      // Jeśli nie można pokazać modala, spróbuj zwykłej odpowiedzi
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Wystąpił błąd podczas otwierania formularza. Spróbuj ponownie.",
          flags: MessageFlags.Ephemeral,
        }).catch(console.error);
      }
    }
  },
};