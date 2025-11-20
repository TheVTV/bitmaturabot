const {
  SlashCommandBuilder,
  MessageFlags,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getTopUsers,
  getTotalUsers,
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
    return "pkt";
  } else if (
    points % 10 >= 2 &&
    points % 10 <= 4 &&
    (points % 100 < 10 || points % 100 >= 20)
  ) {
    return "pkt";
  } else {
    return "pkt";
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

// Funkcja do generowania grafiki rankingu
async function generateRankingImage(
  topUsers,
  guild,
  currentUserRank = null,
  currentUserPoints = null
) {
  const canvas = createCanvas(700, 900);
  const ctx = canvas.getContext("2d");

  try {
    // Załaduj obraz tła
    const bgPath = path.join(__dirname, "..", "assets", "bm_rankingbg_new.png");
    const backgroundImage = await loadImage(bgPath);

    // Narysuj tło - dopasuj do rozmiaru canvas
    ctx.drawImage(backgroundImage, 0, 0, 700, 900);
  } catch (error) {
    console.error("[RANKING] Błąd ładowania tła, używam gradientu:", error);

    // Fallback - gradient
    const gradient = ctx.createLinearGradient(0, 0, 700, 900);
    gradient.addColorStop(0, "#667eea");
    gradient.addColorStop(1, "#764ba2");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 700, 900);
  }

  // Medale
  const medalImages = {
  gold: await loadImage(path.join(__dirname, "..", "assets", "medal_gold.png")),
  silver: await loadImage(path.join(__dirname, "..", "assets", "medal_silver.png")),
  bronze: await loadImage(path.join(__dirname, "..", "assets", "medal_bronze.png")),
  };

  // Subtelna ramka
  // ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  // ctx.lineWidth = 4;
  // ctx.strokeRect(15, 15, 670, 870);

  // Tytuł
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillText("Ranking Kaczki", 350, 50);

  // Lista użytkowników
  const medals = ["1.", "2.", "3."];
  let yPosition = 150;
  const lineHeight = 70;

  for (let i = 0; i < Math.min(topUsers.length, 10); i++) {
    const user = topUsers[i];
    const position = i + 1;

    // Pobierz użytkownika Discord
    let displayName = "Nieznany użytkownik";
    let avatarUrl = null;
    try {
      const discordUser = await guild.members.fetch(user.discord_id);
      displayName = discordUser.displayName || discordUser.user.username;
      avatarUrl = discordUser.user.displayAvatarURL({
        extension: "png",
        size: 64,
      });
    } catch (error) {
      displayName = `Użytkownik opuścił serwer`;
    }

    // Avatar (większy)
    if (avatarUrl) {
      try {
        const avatar = await loadImageFromUrl(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(80, yPosition + 25, 25, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, 55, yPosition, 50, 50);
        ctx.restore();

        // Ramka wokół avatara
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(80, yPosition + 25, 25, 0, Math.PI * 2);
        ctx.stroke();
      } catch (error) {
        // Fallback - kolorowe kółko
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(80, yPosition + 25, 25, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#667eea";
        ctx.font = "bold 20px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayName.charAt(0).toUpperCase(), 100, yPosition + 25);
      }
    }

    // Pozycja/medal
    try {
      // Rysowanie medalu (dla top 3)
      if (i === 0 || i === 1 || i === 2) {
        const medalType = i === 0 ? "gold" : i === 1 ? "silver" : "bronze";
        const medalImg = medalImages[medalType];
      
        // Rysowanie obrazka medalu
        ctx.drawImage(medalImg, 130, yPosition, 40, 40); 
      } else {
        // Pozostałe pozycje (tekst 4., 5., 6., ...)
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px Inter, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${position}.`, 130, yPosition + 25);
      }
    } catch (error) {
      const medal = medals[i] || `${position}.`;
      ctx.fillStyle = position <= 3 ? "#FFD700" : "#ffffff";
      ctx.font = "bold 32px Inter, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(medal, 130, yPosition + 25);
    }

    // Nazwa użytkownika
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Inter, Arial, sans-serif";
    ctx.textAlign = "left";

    // Skróć nazwę jeśli za długa
    let shortName = displayName;
    const maxWidth = 320;
    while (
      ctx.measureText(shortName).width > maxWidth &&
      shortName.length > 1
    ) {
      shortName = shortName.slice(0, -1);
    }
    if (shortName !== displayName) {
      shortName += "...";
    }

    ctx.fillText(shortName, 200, yPosition + 25);

    // Punkty
    ctx.fillStyle = "#cceeffff";
    ctx.font = "bold 24px Inter, Arial, sans-serif";
    ctx.textAlign = "right";
    const pointsText = `${user.points} ${getPointsWord(user.points)}`;
    ctx.fillText(pointsText, 620, yPosition + 25);

    yPosition += lineHeight;
  }

  // Pozycja aktualnego użytkownika (jeśli nie w top 10)
  if (currentUserRank && currentUserPoints && currentUserRank > 10) {
    yPosition += 40;

    // Linia oddzielająca
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(60, yPosition);
    ctx.lineTo(640, yPosition);
    ctx.stroke();

    yPosition += 50;

    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 26px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(
      `Twoja pozycja: #${currentUserRank} (${currentUserPoints} ${getPointsWord(
        currentUserPoints
      )})`,
      350,
      yPosition
    );
  }

  // Resetuj cień
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  return canvas.toBuffer("image/png");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Wyświetl ogólnokursowy ranking Kaczki (top 10)")
    .setContexts([0]),

  async execute(interaction) {
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

    try {
      // Defer reply bo może potrwać chwilę
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      // Pobierz top użytkowników i całkowitą liczbę
      const [topUsers, totalUsers] = await Promise.all([
        getTopUsers(interaction.guild.id, 10),
        getTotalUsers(interaction.guild.id),
      ]);

      if (!topUsers || topUsers.length === 0) {
        await interaction.editReply({
          content:
            "📊 **Ranking Kaczki**\n\n❌ Brak użytkowników z punktami na tym serwerze.",
        });
        return;
      }

      // Sprawdź pozycję aktualnego użytkownika jeśli nie jest w top 10
      let currentUserRank = null;
      let currentUserPoints = null;

      const userInTop = topUsers.find(
        (u) => u.discord_id === interaction.user.id
      );
      if (!userInTop && totalUsers > 10) {
        try {
          const [userRank, userPoints] = await Promise.all([
            getUserRank(interaction.user.id, interaction.guild.id),
            getUserPoints(interaction.user.id, interaction.guild.id),
          ]);

          if (userRank && userPoints > 0) {
            currentUserRank = userRank;
            currentUserPoints = userPoints;
          }
        } catch (error) {
          // Ignoruj błąd
        }
      }

      // Wygeneruj grafikę
      const imageBuffer = await generateRankingImage(
        topUsers,
        interaction.guild,
        currentUserRank,
        currentUserPoints
      );

      // Utwórz attachment
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: `ranking-${interaction.guild.name}.png`,
      });

      await interaction.editReply({
        content: `🏆 **Ranking Kaczki - Top ${topUsers.length}**\n📈 **${totalUsers} użytkowników z punktami**`,
        files: [attachment],
      });
    } catch (error) {
      console.error("[RANKING] Błąd:", error);

      // Fallback do tekstu jeśli grafika się nie powiedzie
      try {
        const [topUsers, totalUsers] = await Promise.all([
          getTopUsers(interaction.guild.id, 10),
          getTotalUsers(interaction.guild.id),
        ]);

        if (!topUsers || topUsers.length === 0) {
          await interaction.editReply({
            content:
              "📊 **Ranking Kaczki**\n\n❌ Brak użytkowników z punktami na tym serwerze.",
          });
          return;
        }

        // Zbuduj ranking tekstowy
        let response = `🏆 **Ranking Kaczki - Top ${topUsers.length}**\n\n`;

        const medals = ["🥇", "🥈", "🥉"];

        for (let i = 0; i < topUsers.length; i++) {
          const user = topUsers[i];
          const position = i + 1;

          // Pobierz użytkownika Discord
          let displayName = "Nieznany użytkownik";
          try {
            const discordUser = await interaction.guild.members.fetch(
              user.discord_id
            );
            displayName = discordUser.displayName || discordUser.user.username;
          } catch (error) {
            displayName = `Użytkownik opuścił serwer`;
          }

          const medal = medals[i] || `${position}.`;

          response += `${medal} **${displayName}** - ${
            user.points
          } ${getPointsWord(user.points)}\n`;
        }

        response += `\n📈 **Statystyki:** ${totalUsers} użytkowników z punktami`;
        response += `\n\n⚠️ *Grafika niedostępna - wyświetlam tekstowo*`;

        await interaction.editReply({
          content: response,
        });
      } catch (fallbackError) {
        console.error("[RANKING] Błąd fallback:", fallbackError);

        try {
          if (interaction.deferred) {
            await interaction.editReply({
              content:
                "❌ Wystąpił błąd podczas pobierania rankingu. Spróbuj ponownie.",
            });
          } else if (!interaction.replied) {
            await interaction.reply({
              content:
                "❌ Wystąpił błąd podczas pobierania rankingu. Spróbuj ponownie.",
              flags: MessageFlags.Ephemeral,
            });
          }
        } catch (replyError) {
          console.error("[RANKING] Błąd odpowiedzi:", replyError.message);
        }
      }
    }
  },
};
