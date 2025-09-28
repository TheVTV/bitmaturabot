const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { getAllTeachers } = require("../db/teachers");
const { addPending } = require("../state/pending");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dodaj-szkopul-id")
    .setDescription(
      "Dodaj/aktualizuj identyfikatory Szkopuł dla uczniów w grupie (tylko nauczyciele)"
    )
    .addIntegerOption((option) =>
      option
        .setName("grupa")
        .setDescription(
          "Numer grupy (wymagany jeśli prowadzisz więcej niż jedną grupę)"
        )
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts([0]),
  async execute(interaction) {
    // Natychmiastowa odpowiedź na interakcję, żeby uniknąć timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Sprawdź czy użytkownik jest nauczycielem
      const teachers = await getAllTeachers();
      const teacherGroups = teachers.filter(
        (t) => t.discord_id === interaction.user.id
      );

      if (teacherGroups.length === 0) {
        return await interaction.editReply({
          content: "❌ Tylko nauczyciele mogą używać tej komendy.",
        });
      }

      // Jeśli nauczyciel ma wiele grup, sprawdź czy podał parametr
      const selectedGroupId = interaction.options.getInteger("grupa");
      let targetGroup;

      if (teacherGroups.length > 1) {
        // Nauczyciel ma wiele grup
        if (!selectedGroupId) {
          const groupsList = teacherGroups
            .map((g) => g.group_id)
            .sort((a, b) => a - b)
            .join(", ");
          return await interaction.editReply({
            content: `❌ Prowadzisz ${teacherGroups.length} grup (${groupsList}). Musisz określić grupę używając parametru \`grupa\`.\n\nPrzykład: \`/dodaj-szkopul-id grupa:2\``,
          });
        }

        // Sprawdź czy podana grupa należy do nauczyciela
        targetGroup = teacherGroups.find((g) => g.group_id === selectedGroupId);
        if (!targetGroup) {
          const groupsList = teacherGroups
            .map((g) => g.group_id)
            .sort((a, b) => a - b)
            .join(", ");
          return await interaction.editReply({
            content: `❌ Nie prowadzisz grupy ${selectedGroupId}. Twoje grupy: ${groupsList}`,
          });
        }
      } else {
        // Nauczyciel ma tylko jedną grupę
        targetGroup = teacherGroups[0];

        // Jeśli podał parametr grupy, sprawdź czy się zgadza
        if (selectedGroupId && selectedGroupId !== targetGroup.group_id) {
          return await interaction.editReply({
            content: `❌ Nie prowadzisz grupy ${selectedGroupId}. Twoja grupa: ${targetGroup.group_id}`,
          });
        }
      }

      // Utwórz prywatny wątek dla dodawania szkopuł ID
      const thread = await interaction.channel.threads.create({
        name: `📝 Szkopuł ID - ${interaction.user.username} (Grupa ${targetGroup.group_id})`,
        autoArchiveDuration: 60, // 1 godzina
        type: ChannelType.PrivateThread,
        reason: "Dodawanie szkopuł ID przez nauczyciela",
      });

      // Dodaj nauczyciela do wątku
      await thread.members.add(interaction.user.id);

      // Ustaw stan oczekujący na plik
      addPending(interaction.user.id, {
        type: "import_szkopul_ids",
        guildId: interaction.guild.id,
        threadId: thread.id,
        userId: interaction.user.id,
        teacherGroupId: targetGroup.group_id,
        startTime: Date.now(),
      });

      // Odpowiedź na komendę
      const groupInfo =
        teacherGroups.length > 1
          ? ` dla grupy ${targetGroup.group_id} (z ${teacherGroups.length} prowadzonych przez Ciebie)`
          : ` dla grupy ${targetGroup.group_id}`;

      await interaction.editReply({
        content: `✅ Utworzono prywatny wątek ${thread} do dodawania szkopuł ID${groupInfo}!`,
      });

      // Wyślij instrukcje do wątku
      const embed = new EmbedBuilder()
        .setTitle("📝 Dodawanie identyfikatorów Szkopuł")
        .setColor(0x00ff00)
        .setDescription(
          "Wyślij plik tekstowy (.txt) z identyfikatorami Szkopuł dla uczniów z Twojej grupy."
        )
        .addFields(
          {
            name: "👥 Grupa",
            value: targetGroup.group_id.toString(),
            inline: true,
          },
          {
            name: "📝 Format pliku",
            value: "Każda linia: `Imię Nazwisko;szkopul_id`",
            inline: false,
          },
          {
            name: "📋 Przykład",
            value:
              "```Jan Kowalski;jkowalski123\nAnna Nowak;anowak456\nPiotr Wiśniewski;pwisniewski789```",
            inline: false,
          },
          {
            name: "⚠️ Zasady",
            value:
              "• Każda osoba w **osobnej linii**\n• Dane oddzielone **średnikami** (;)\n• Możesz aktualizować tylko uczniów ze swojej grupy\n• Format: **Imię Nazwisko;identyfikator_szkopul**",
            inline: false,
          },
          {
            name: "🔍 Walidacja",
            value:
              "Bot sprawdzi czy podane imiona i nazwiska istnieją w Twojej grupie i zasugeruje poprawki w przypadku błędów.",
            inline: false,
          }
        )
        .setFooter({ text: "🤖 Wyślij plik .txt, a ja zajmę się resztą!" });

      await thread.send({ embeds: [embed] });
    } catch (error) {
      console.error("[DODAJ-SZKOPUL-ID] Błąd tworzenia wątku:", error);

      try {
        await interaction.editReply({
          content:
            "❌ Wystąpił błąd podczas tworzenia wątku. Spróbuj ponownie.",
        });
      } catch (replyError) {
        console.error("[DODAJ-SZKOPUL-ID] Błąd odpowiedzi:", replyError);
      }
    }
  },
};
