const {
  SlashCommandBuilder,
  MessageFlags,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getTopUsersByGroup,
  getUserRank,
  getUserPoints,
} = require("../db/points");
const {
  getAdminRoleName,
  getTeacherRoleName,
  getStudentRoleName,
} = require("../db/config_mysql");
const { createCanvas, loadImage } = require("canvas");
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

async function createRankingImage(topUsers, client, groupNumber) {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext("2d");

  // Wczytaj tło
  let bgImage;
  try {
    bgImage = await loadImage(
      path.join(__dirname, "..", "assets", "bgranking.png")
    );
  } catch (error) {
    console.warn(
      "[RANKING] Nie można wczytać tła, używam gradientu",
      error.message
    );
    // Gradient fallback
    const gradient = ctx.createLinearGradient(0, 0, 0, 600);
    gradient.addColorStop(0, "#1a1a2e");
    gradient.addColorStop(1, "#16213e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 600);
  }

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, 800, 600);
  }

  // Tytuł
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`🏆 RANKING GRUPY ${groupNumber}`, 400, 60);

  // Jeśli brak użytkowników
  if (topUsers.length === 0) {
    ctx.font = "24px Arial";
    ctx.fillStyle = "#cccccc";
    ctx.fillText("Brak użytkowników w tej grupie", 400, 300);
    return canvas.toBuffer();
  }

  let startY = 120;
  const lineHeight = 45;

  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i];
    const yPos = startY + i * lineHeight;

    try {
      // Pobierz użytkownika Discord
      const discordUser = await client.users.fetch(user.discord_id);

      // Pozycja
      let medal = "";
      let positionColor = "#ffffff";
      if (i === 0) {
        medal = "🥇";
        positionColor = "#ffd700";
      } else if (i === 1) {
        medal = "🥈";
        positionColor = "#c0c0c0";
      } else if (i === 2) {
        medal = "🥉";
        positionColor = "#cd7f32";
      }

      // Pozycja
      ctx.fillStyle = positionColor;
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`${medal}${i + 1}.`, 50, yPos + 25);

      // Avatar
      try {
        const avatarUrl = discordUser.displayAvatarURL({
          extension: "png",
          size: 64,
        });
        const avatar = await loadImageFromUrl(avatarUrl);

        // Rysuj okrągły avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(160, yPos + 15, 20, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 140, yPos - 5, 40, 40);
        ctx.restore();
      } catch (avatarError) {
        // Fallback - rysuj okrąg
        ctx.fillStyle = "#666666";
        ctx.beginPath();
        ctx.arc(160, yPos + 15, 20, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Nazwa użytkownika
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px Arial";
      const displayName =
        user.fullname || discordUser.displayName || discordUser.username;
      ctx.fillText(displayName, 200, yPos + 25);

      // Punkty
      ctx.fillStyle = "#00ff88";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "right";
      const pointsText = `${user.points} ${getPointsWord(user.points)}`;
      ctx.fillText(pointsText, 750, yPos + 25);
    } catch (userError) {
      console.warn(
        `[RANKING] Nie można pobrać użytkownika ${user.discord_id}:`,
        userError.message
      );

      // Fallback - pokaż bez avatara
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}.`, 50, yPos + 25);

      ctx.fillStyle = "#cccccc";
      ctx.font = "20px Arial";
      const displayName = user.fullname || "Nieznany użytkownik";
      ctx.fillText(displayName, 200, yPos + 25);

      ctx.fillStyle = "#00ff88";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "right";
      const pointsText = `${user.points} ${getPointsWord(user.points)}`;
      ctx.fillText(pointsText, 750, yPos + 25);
    }
  }

  // Stopka
  ctx.fillStyle = "#888888";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `Pokazano ${topUsers.length} najlepszych użytkowników`,
    400,
    580
  );

  return canvas.toBuffer();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking-grupa")
    .setDescription("Wyświetl ranking punktowy dla konkretnej grupy")
    .addIntegerOption((option) =>
      option
        .setName("grupa")
        .setDescription("Numer grupy (np. 1, 2, 3...)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(999)
    )
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź uprawnienia
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

    const groupNumber = interaction.options.getInteger("grupa");

    try {
      await interaction.deferReply();

      // Pobierz ranking dla grupy (zawsze 10 najlepszych)
      const topUsers = await getTopUsersByGroup(
        interaction.guild.id,
        groupNumber,
        10
      );

      if (topUsers.length === 0) {
        return interaction.editReply({
          content: `📊 **Ranking grupy ${groupNumber}**\n\nBrak użytkowników w tej grupie lub nikt jeszcze nie ma punktów.`,
        });
      }

      // Utwórz obraz rankingu
      const imageBuffer = await createRankingImage(
        topUsers,
        interaction.client,
        groupNumber
      );
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: `ranking-grupa-${groupNumber}.png`,
      });

      await interaction.editReply({
        files: [attachment],
      });
    } catch (error) {
      console.error("[RANKING-GRUPA] Błąd:", error);
      await interaction.editReply({
        content: "❌ Wystąpił błąd podczas pobierania rankingu grupy.",
      });
    }
  },
};
