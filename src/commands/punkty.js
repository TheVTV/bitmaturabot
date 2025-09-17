const {
  SlashCommandBuilder,
  MessageFlags,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { getUserPoints, getUserRank } = require("../db/points");
const {
  getAdminRoleName,
  getTeacherRoleName,
  getStudentRoleName,
} = require("../db/config_mysql");
const { createCanvas, loadImage } = require("canvas");
const { checkUserPermissions } = require("../utils/permissions");
const https = require("https");
const http = require("http");
const path = require("path");

// Funkcja do poprawnej odmiany słowa "punkt"
function getPointsWord(points) {
  if (points === 1) {
    return "punkt";
  } else if (
    points % 10 >= 2 &&
    points % 10 <= 4 &&
    (points % 100 < 10 || points % 100 >= 20)
  ) {
    return "punkty";
  } else {
    return "punktów";
  }
}

// Funkcja do pobierania obrazu z URL
async function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https:") ? https : http;

    protocol
      .get(url, (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(chunk);
        });

        response.on("end", async () => {
          try {
            const buffer = Buffer.concat(chunks);
            const image = await loadImage(buffer);
            resolve(image);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

// Funkcja do generowania grafiki punktów
async function generatePointsImage(user, points, rank, member) {
  const canvas = createCanvas(600, 200);
  const ctx = canvas.getContext("2d");

  try {
    // Załaduj obraz tła
    const bgPath = path.join(__dirname, "..", "assets", "bgpoints.png");
    const backgroundImage = await loadImage(bgPath);

    // Narysuj tło - dopasuj do rozmiaru canvas
    ctx.drawImage(backgroundImage, 0, 0, 600, 200);
  } catch (error) {
    console.error("[PUNKTY] Błąd ładowania tła, używam gradientu:", error);

    // Fallback - gradient jak wcześniej
    const gradient = ctx.createLinearGradient(0, 0, 600, 200);
    gradient.addColorStop(0, "#667eea");
    gradient.addColorStop(1, "#764ba2");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 200);
  }

  // Subtelna ramka (opcjonalnie)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 584, 184);

  // Avatar użytkownika - większy
  try {
    const avatarUrl = user.displayAvatarURL({ extension: "png", size: 128 });
    const avatar = await loadImageFromUrl(avatarUrl);

    // Okrągły avatar - większy
    ctx.save();
    ctx.beginPath();
    ctx.arc(100, 100, 55, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 45, 45, 110, 110);
    ctx.restore();

    // Ramka wokół avatara
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(100, 100, 55, 0, Math.PI * 2);
    ctx.stroke();
  } catch (error) {
    console.error("[PUNKTY] Błąd ładowania avatara:", error);

    // Fallback - kolorowe kółko z inicjałem - większe
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(100, 100, 55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#667eea";
    ctx.font = "bold 35px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const serverName = member ? member.displayName : user.displayName;
    ctx.fillText(serverName.charAt(0).toUpperCase(), 100, 100);
  }

  // Nazwa użytkownika - wyśrodkowana wertykalnie
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dodaj cień do tekstu
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const maxNameWidth = 280;
  let fontSize = 28;
  let displayName = member ? member.displayName : user.displayName;

  // Dostosuj rozmiar czcionki jeśli nazwa jest za długa
  while (ctx.measureText(displayName).width > maxNameWidth && fontSize > 18) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
  }

  // Jeśli nadal za długie, skróć tekst
  if (ctx.measureText(displayName).width > maxNameWidth) {
    while (
      ctx.measureText(displayName + "...").width > maxNameWidth &&
      displayName.length > 1
    ) {
      displayName = displayName.slice(0, -1);
    }
    displayName += "...";
  }

  // Wyśrodkowany tekst w prawej części
  const centerX = 400; // centrum prawej części
  ctx.fillText(displayName, centerX, 70);

  // Punkty - duży tekst wyśrodkowany
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Wyśrodkowane punkty z poprawną odmianą
  const pointsWord = getPointsWord(points);
  const pointsText = `${points} ${pointsWord}`;
  ctx.fillText(pointsText, centerX, 105);

  // Pozycja w rankingu - wyśrodkowana
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 22px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  const rankText = rank > 0 ? `#${rank} w rankingu` : "Brak w rankingu";
  ctx.fillText(rankText, centerX, 140);

  // Resetuj cień
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  return canvas.toBuffer("image/png");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("punkty")
    .setDescription("Sprawdź punkty użytkownika")
    .addUserOption((option) =>
      option
        .setName("użytkownik")
        .setDescription(
          "Użytkownik którego punkty chcesz sprawdzić (opcjonalne)"
        )
        .setRequired(false)
    )
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(interaction, "punkty");
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Sprawdź czy użytkownik ma odpowiednią rolę
    const adminRoleName = await getAdminRoleName(interaction.guild.id);
    const teacherRoleName = await getTeacherRoleName(interaction.guild.id);
    const studentRoleName = await getStudentRoleName(interaction.guild.id);

    const hasAdminRole = interaction.member.roles.cache.some(
      (role) => role.name === adminRoleName
    );
    const hasTeacherRole = interaction.member.roles.cache.some(
      (role) => role.name === teacherRoleName
    );
    const hasStudentRole = interaction.member.roles.cache.some(
      (role) => role.name === studentRoleName
    );

    if (!hasAdminRole && !hasTeacherRole && !hasStudentRole) {
      return interaction.reply({
        content: `❌ Ta komenda wymaga roli ucznia (**${studentRoleName}**), nauczyciela (**${teacherRoleName}**) lub administratora (**${adminRoleName}**).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser =
      interaction.options.getUser("użytkownik") || interaction.user;

    // Sprawdź czy target to bot
    if (targetUser.bot) {
      return interaction.reply({
        content: "❌ Boty nie mają punktów!",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Defer reply bo może potrwać chwilę
      await interaction.deferReply();

      // Pobierz punkty i pozycję w rankingu
      const points = await getUserPoints(targetUser.id, interaction.guild.id);
      const rank = await getUserRank(targetUser.id, interaction.guild.id);

      // Pobierz informacje o członku serwera dla nazwy serwera
      const targetMember = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);

      // Wygeneruj grafikę
      const imageBuffer = await generatePointsImage(
        targetUser,
        points,
        rank,
        targetMember
      );

      // Utwórz attachment
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: `punkty-${targetUser.username}.png`,
      });

      const isOwnPoints = targetUser.id === interaction.user.id;
      const displayName = targetMember
        ? targetMember.displayName
        : targetUser.displayName;
      const message = isOwnPoints
        ? `📊 **Twoje punkty**`
        : `📊 **Punkty użytkownika ${displayName}**`;

      await interaction.editReply({
        content: message,
        files: [attachment],
      });
    } catch (error) {
      console.error("[PUNKTY] Błąd:", error);

      // Fallback do tekstu jeśli grafika się nie powiedzie
      try {
        const points = await getUserPoints(targetUser.id, interaction.guild.id);
        const rank = await getUserRank(targetUser.id, interaction.guild.id);
        const targetMember = await interaction.guild.members
          .fetch(targetUser.id)
          .catch(() => null);
        const isOwnPoints = targetUser.id === interaction.user.id;
        const displayName = targetMember
          ? targetMember.displayName
          : targetUser.displayName;
        const title = isOwnPoints
          ? "Twoje punkty"
          : `Punkty użytkownika ${displayName}`;

        let response = `📊 **${title}**\n\n`;
        response += `👤 **Użytkownik:** ${targetUser}\n`;
        response += `⭐ **Punkty:** ${points} ${getPointsWord(points)}\n`;
        response += `🏆 **Pozycja:** ${
          rank > 0 ? `#${rank}` : "Brak w rankingu"
        }\n\n`;
        response += `⚠️ *Grafika niedostępna - wyświetlam tekstowo*`;

        await interaction.editReply({
          content: response,
        });
      } catch (fallbackError) {
        console.error("[PUNKTY] Błąd fallback:", fallbackError);
        await interaction.editReply({
          content:
            "❌ Wystąpił błąd podczas pobierania punktów. Spróbuj ponownie.",
        });
      }
    }
  },
};
