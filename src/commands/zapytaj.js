const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const { getTeacherRoleName, getAdminRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("zapytaj")
    .setDescription(
      "Zadaj anonimowe pytanie nauczycielowi lub administratorowi"
    )
    .addUserOption((option) =>
      option
        .setName("osoba")
        .setDescription(
          "Nauczyciel lub administrator do którego kierujesz pytanie"
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("pytanie")
        .setDescription("Treść pytania (maksymalnie 1000 znaków)")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .setContexts([0]),

  async execute(interaction) {
    try {
      // Sprawdź uprawnienia użytkownika
      const permissions = await checkUserPermissions(interaction, "zapytaj");
      if (!permissions.canUseCommand) {
        await interaction.reply({
          content: `❌ **Brak dostępu:** ${permissions.reason}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const targetUser = interaction.options.getUser("osoba");
      const question = interaction.options.getString("pytanie");

      // Sprawdź czy target user to członek serwera
      const targetMember = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);
      if (!targetMember) {
        await interaction.reply({
          content: "❌ Ta osoba nie jest członkiem tego serwera.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Sprawdź czy osoba docelowa to nauczyciel lub admin
      const teacherRoleName = await getTeacherRoleName(interaction.guild.id);
      const adminRoleName = await getAdminRoleName(interaction.guild.id);

      const isTargetTeacher = targetMember.roles.cache.some(
        (role) => role.name === teacherRoleName
      );
      const isTargetAdmin = targetMember.roles.cache.some(
        (role) => role.name === adminRoleName
      );

      if (!isTargetTeacher && !isTargetAdmin) {
        await interaction.reply({
          content: `❌ Możesz zadawać pytania tylko nauczycielom (rola: **${teacherRoleName}**) lub administratorom (rola: **${adminRoleName}**).`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Sprawdź czy użytkownik nie próbuje pingować samego siebie
      if (targetUser.id === interaction.user.id) {
        await interaction.reply({
          content: "❌ Nie możesz zadać pytania samemu sobie.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Utwórz embed z anonimowym pytaniem (uproszczony)
      const embed = new EmbedBuilder()
        .setTitle("❓ Anonimowe pytanie")
        .setDescription(question)
        .setColor(0xf39c12)
        .setTimestamp()
        .setFooter({
          text: "Pytanie zostało zadane anonimowo",
        });

      // Wyślij pytanie na kanał jako nową wiadomość (nie jako odpowiedź)
      const sentMessage = await interaction.channel.send({
        content: `${targetUser}`, // Ping osoby
        embeds: [embed],
      });

      // Wyślij DM do odbiorcy z linkiem do pytania
      try {
        const messageLink = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${sentMessage.id}`;

        const dmEmbed = new EmbedBuilder()
          .setTitle("📩 Otrzymałeś anonimowe pytanie")
          .setDescription(
            `Ktoś zadał Ci pytanie na kanale ${interaction.channel}`
          )
          .setColor(0x3498db)
          .addFields([
            {
              name: "❓ Pytanie:",
              value:
                question.length > 300
                  ? question.slice(0, 297) + "..."
                  : question,
              inline: false,
            },
            {
              name: "🔗 Link do wiadomości:",
              value: `[Kliknij tutaj aby przejść do pytania](${messageLink})`,
              inline: false,
            },
          ])
          .setTimestamp()
          .setFooter({
            text: "Pytanie jest anonimowe - nie wiesz kto je zadał",
          });

        await targetUser.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(
          `Nie można wysłać DM do ${targetUser.tag}:`,
          dmError.message
        );
        // Nie przerywamy wykonania jeśli DM się nie uda
      }

      // Wyślij potwierdzenie do osoby zadającej pytanie (prywatnie)
      await interaction.reply({
        content: `✅ Twoje anonimowe pytanie zostało przekazane do ${targetUser}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Błąd podczas wysyłania anonimowego pytania:", error);

      if (!interaction.replied) {
        await interaction.reply({
          content: "❌ Wystąpił błąd podczas wysyłania pytania.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
