const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const {
  getTeacherRoleName,
  getStudentRoleName,
} = require("../db/config_mysql");

// Mapa do przechowywania stanu ankiet (w produkcji lepiej użyć bazy danych)
const clarityPolls = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("czy-jasne")
    .setDescription(
      "Utwórz ankietę sprawdzającą zrozumienie tematu przez uczniów"
    )
    .addStringOption((option) =>
      option
        .setName("temat")
        .setDescription("Temat lub zagadnienie do sprawdzenia")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts([0]),

  async execute(interaction) {
    try {
      // Sprawdź uprawnienia użytkownika
      const permissions = await checkUserPermissions(interaction, "czy-jasne");
      if (!permissions.canUseCommand) {
        await interaction.reply({
          content: `❌ **Brak dostępu:** ${permissions.reason}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Sprawdź czy użytkownik ma rolę nauczyciela
      const teacherRoleName = await getTeacherRoleName(interaction.guild.id);
      const hasTeacherRole = interaction.member.roles.cache.some(
        (role) => role.name === teacherRoleName
      );

      if (!hasTeacherRole) {
        await interaction.reply({
          content: `❌ Ta komenda jest dostępna tylko dla nauczycieli (rola: **${teacherRoleName}**).`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const topic = interaction.options.getString("temat");
      const pollId = `clarity_${interaction.channelId}_${Date.now()}`;

      // Inicjalizuj dane ankiety
      clarityPolls.set(pollId, {
        topic,
        teacherId: interaction.user.id,
        channelId: interaction.channelId,
        clearVotes: 0,
        unclearVotes: 0,
        unclearReasons: [],
        votedUsers: new Set(),
        messageId: null,
      });

      // Utwórz embed
      const embed = createClarityEmbed(topic, 0, 0, []);

      // Utwórz przyciski
      const buttons = createClarityButtons(pollId);

      await interaction.reply({
        embeds: [embed],
        components: [buttons],
      });

      // Zapisz ID wiadomości
      const reply = await interaction.fetchReply();
      clarityPolls.get(pollId).messageId = reply.id;
    } catch (error) {
      console.error("Błąd podczas tworzenia ankiety czy-jasne:", error);

      if (!interaction.replied) {
        await interaction.reply({
          content: "❌ Wystąpił błąd podczas tworzenia ankiety.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },

  // Obsługa interakcji z przyciskami
  async handleButtonInteraction(interaction) {
    if (!interaction.customId.startsWith("clarity_")) return;

    // Poprawne parsowanie: clarity_action_channelId_timestamp
    const parts = interaction.customId.split("_");
    const action = parts[1]; // "clear" lub "unclear"
    const pollId = parts.slice(2).join("_"); // "channelId_timestamp"
    const fullPollId = `clarity_${pollId}`;
    const poll = clarityPolls.get(fullPollId);

    if (!poll) {
      await interaction.reply({
        content: "❌ Ta ankieta już nie istnieje.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Sprawdź czy użytkownik to uczeń (nie nauczyciel)
    const studentRoleName = await getStudentRoleName(interaction.guild.id);
    const teacherRoleName = await getTeacherRoleName(interaction.guild.id);

    const hasStudentRole = interaction.member.roles.cache.some(
      (role) => role.name === studentRoleName
    );
    const hasTeacherRole = interaction.member.roles.cache.some(
      (role) => role.name === teacherRoleName
    );

    if (hasTeacherRole) {
      await interaction.reply({
        content: `❌ Nauczyciele nie mogą głosować w ankietach.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!hasStudentRole) {
      await interaction.reply({
        content: `❌ Tylko uczniowie mogą głosować w tej ankiecie (wymagana rola: **${studentRoleName}**).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Sprawdź czy użytkownik już głosował
    if (poll.votedUsers.has(interaction.user.id)) {
      await interaction.reply({
        content: "❌ Już zagłosowałeś w tej ankiecie. Jeden głos na osobę.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "clear") {
      // Użytkownik kliknął "jasne"
      poll.clearVotes++;
      poll.votedUsers.add(interaction.user.id);

      // Aktualizuj embed
      const newEmbed = createClarityEmbed(
        poll.topic,
        poll.clearVotes,
        poll.unclearVotes,
        poll.unclearReasons
      );

      await interaction.update({
        embeds: [newEmbed],
        components: [createClarityButtons(fullPollId)],
      });
    } else if (action === "unclear") {
      // Użytkownik kliknął "niejasne" - pokaż modal
      const modal = createClarityModal(fullPollId);
      await interaction.showModal(modal);
    }
  },

  // Obsługa submitu modału
  async handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith("clarity_modal_")) return;

    const pollId = interaction.customId.replace("clarity_modal_", "");
    const poll = clarityPolls.get(pollId);

    if (!poll) {
      await interaction.reply({
        content: "❌ Ta ankieta już nie istnieje.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Sprawdź czy użytkownik już głosował
    if (poll.votedUsers.has(interaction.user.id)) {
      await interaction.reply({
        content: "❌ Już zagłosowałeś w tej ankiecie.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const reason = interaction.fields.getTextInputValue("unclear_reason");

    // Dodaj głos "niejasne"
    poll.unclearVotes++;
    poll.unclearReasons.push(reason);
    poll.votedUsers.add(interaction.user.id);

    // Aktualizuj embed
    const newEmbed = createClarityEmbed(
      poll.topic,
      poll.clearVotes,
      poll.unclearVotes,
      poll.unclearReasons
    );

    // Znajdź oryginalną wiadomość i zaktualizuj
    try {
      const channel = interaction.guild.channels.cache.get(poll.channelId);
      const message = await channel.messages.fetch(poll.messageId);

      await message.edit({
        embeds: [newEmbed],
        components: [createClarityButtons(pollId)],
      });

      await interaction.reply({
        content: "✅ Twoja odpowiedź została zapisana anonimowo.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Błąd podczas aktualizacji ankiety:", error);
      await interaction.reply({
        content: "❌ Wystąpił błąd podczas zapisywania odpowiedzi.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  // Eksportowanie mapy dla innych komend (opcjonalnie)
  getClarityPolls() {
    return clarityPolls;
  },
};

function createClarityEmbed(topic, clearVotes, unclearVotes, unclearReasons) {
  const embed = new EmbedBuilder()
    .setTitle("📊 Czy to jest jasne?")
    .setDescription(`**Temat:** ${topic}`)
    .setColor(0x3498db)
    .addFields([
      {
        name: "✅ Jasne",
        value: `${clearVotes} ${
          clearVotes === 1 ? "osoba" : clearVotes < 5 ? "osoby" : "osób"
        }`,
        inline: true,
      },
      {
        name: "❓ Niejasne",
        value: `${unclearVotes} ${
          unclearVotes === 1 ? "osoba" : unclearVotes < 5 ? "osoby" : "osób"
        }`,
        inline: true,
      },
      {
        name: "\u200b",
        value: "\u200b",
        inline: true,
      },
    ])
    .setTimestamp()
    .setFooter({
      text: "Każdy uczeń może zagłosować tylko raz • Odpowiedzi są anonimowe",
    });

  // Dodaj niejasne kwestie jeśli istnieją
  if (unclearReasons.length > 0) {
    const reasonsText = unclearReasons
      .map((reason, index) => `${index + 1}. ${reason}`)
      .join("\n");

    embed.addFields([
      {
        name: "❓ Co jest niejasne:",
        value:
          reasonsText.length > 1024
            ? reasonsText.slice(0, 1021) + "..."
            : reasonsText,
        inline: false,
      },
    ]);
  }

  return embed;
}

function createClarityButtons(pollId) {
  // pollId już zawiera "clarity_", więc nie usuwamy prefiksu
  const clearButton = new ButtonBuilder()
    .setCustomId(`${pollId.replace("clarity_", "clarity_clear_")}`)
    .setLabel("✅ Jasne")
    .setStyle(ButtonStyle.Success);

  const unclearButton = new ButtonBuilder()
    .setCustomId(`${pollId.replace("clarity_", "clarity_unclear_")}`)
    .setLabel("❓ Niejasne")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(clearButton, unclearButton);
}

function createClarityModal(pollId) {
  const modal = new ModalBuilder()
    .setCustomId(`clarity_modal_${pollId}`)
    .setTitle("Co jest niejasne?");

  const reasonInput = new TextInputBuilder()
    .setCustomId("unclear_reason")
    .setLabel("Opisz co jest niejasne:")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      "Wpisz tutaj co sprawia Ci trudność lub jest niezrozumiałe..."
    )
    .setRequired(true)
    .setMaxLength(500);

  const actionRow = new ActionRowBuilder().addComponents(reasonInput);
  modal.addComponents(actionRow);

  return modal;
}
