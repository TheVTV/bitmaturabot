const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getAdminRoleName,
  getTeacherRoleName,
  getStudentRoleName,
} = require("../db/config_mysql");
const { getUserByDiscordId } = require("../db/users_mysql");
const { checkUserPermissions } = require("../utils/permissions");

// Import cache arkuszy z scripts
const { getSheetsCache } = require("../scripts/import-points-from-sheets");

// Funkcja do analizy obecności z arkusza
function analyzeAttendance(sheetData, userRowIndex) {
  const attendance = {
    present: 0,
    absentUnexcused: 0,
    absentExcused: 0,
    excused: 0, // zwolnieni (zw)
    totalClasses: 0,
    attendanceRate: "0%",
    unexpcusedDates: [],
    excusedDates: [],
    excusedFromClass: [], // daty zwolnień
    plusPoints: 0,
    plusPercentage: 0,
  };

  if (!sheetData || !sheetData[userRowIndex]) {
    return attendance;
  }

  const userRow = sheetData[userRowIndex];
  const dateRow = sheetData[19]; // wiersz 21 (indeks 19) zawiera daty

  // Analiza plusów z kolumny D (indeks 3) - przesunięte o 1 w prawo
  const plusCell = userRow[3];
  if (plusCell !== undefined && plusCell !== null && plusCell !== "") {
    const numericValue = parseFloat(String(plusCell).replace(",", "."));
    if (!isNaN(numericValue)) {
      attendance.plusPoints = numericValue;
      attendance.plusPercentage = (attendance.plusPoints / 20) * 100;
    }
  }

  // console.log("User Row:", userRow);
  // Kolumny E do AI to teraz indeksy 4 do 34 (E=4, F=5, ..., AI=34) - przesunięte o 1, pomijamy ostatnią kolumnę (AJ) z plusami
  for (let colIndex = 4; colIndex <= 34; colIndex++) {
    const cellValue = userRow[colIndex];
    const dateValue = dateRow ? dateRow[colIndex] : null;

    if (cellValue !== undefined && cellValue !== null && cellValue !== "") {
      attendance.totalClasses++;

      const cellStr = String(cellValue).toLowerCase().trim();

      if (cellStr === "n") {
        attendance.absentUnexcused++;
        if (dateValue) {
          attendance.unexpcusedDates.push(dateValue);
        }
      } else if (cellStr === "u") {
        attendance.absentExcused++;
        if (dateValue) {
          attendance.excusedDates.push(dateValue);
        }
      } else if (cellStr === "zw") {
        attendance.excused++;
        if (dateValue) {
          attendance.excusedFromClass.push(dateValue);
        }
      } else if (!isNaN(Number(cellStr))) {
        attendance.present++;
      }
    }
  }

  // Pobierz procentową frekwencję z kolumny AK (teraz indeks 36) - przesunięte o 1
  const attendanceRateCell = userRow[36];
  if (attendanceRateCell !== undefined && attendanceRateCell !== null) {
    attendance.attendanceRate = String(attendanceRateCell);
  }

  return attendance;
}

// Funkcja do analizy danych Szkopuł z arkusza
function analyzeSkopul(sheetData, userRowIndex) {
  const skopul = {
    basicTasks: 0,
    additionalTasks: 0,
    totalPoints: 0,
    percentage: "0%",
    percentageNumeric: 0,
    maxBasicPoints: 0,
    skopulPoints: 0,
  };

  if (!sheetData || !sheetData[userRowIndex]) {
    return skopul;
  }

  const userRow = sheetData[userRowIndex];

  // Indeks 37: suma punktów z zadań bazowych (przesunięte o 1)
  const basicTasksCell = userRow[37];
  if (basicTasksCell !== undefined && basicTasksCell !== null) {
    skopul.basicTasks =
      parseFloat(String(basicTasksCell).replace(",", ".")) || 0;
  }

  // Indeks 38: suma punktów z zadań dodatkowych (przesunięte o 1)
  const additionalTasksCell = userRow[38];
  if (additionalTasksCell !== undefined && additionalTasksCell !== null) {
    skopul.additionalTasks =
      parseFloat(String(additionalTasksCell).replace(",", ".")) || 0;
  }

  // Indeks 39: suma całkowita (przesunięte o 1)
  const totalPointsCell = userRow[39];
  if (totalPointsCell !== undefined && totalPointsCell !== null) {
    skopul.totalPoints =
      parseFloat(String(totalPointsCell).replace(",", ".")) || 0;
  }

  // Indeks 40: wynik procentowy (przesunięte o 1)
  const percentageCell = userRow[40];
  if (percentageCell !== undefined && percentageCell !== null) {
    skopul.percentage = String(percentageCell);
    if (!skopul.percentage.includes("%")) {
      skopul.percentage += "%";
    }

    // Wyciągnij wartość numeryczną procentu
    const numericValue =
      parseFloat(String(percentageCell).replace("%", "").replace(",", ".")) ||
      0;
    skopul.percentageNumeric = numericValue;
  }

  // Maksymalny wynik za część bazową z komórki AM21 (wiersz 20, kolumna AM = indeks 38) - przesunięte o 1
  // AM21 to wiersz 21 (indeks 20), kolumna AM (indeks 38)
  if (
    sheetData[19] &&
    sheetData[19][37] !== undefined &&
    sheetData[19][37] !== null
  ) {
    skopul.maxBasicPoints =
      parseFloat(String(sheetData[19][37]).replace(",", ".")) || 0;
  }

  // Punkty za szkopuła z kolumny BB (indeks 53) - poprawiony indeks
  const skopulPointsCell = userRow[53];
  if (skopulPointsCell !== undefined && skopulPointsCell !== null) {
    skopul.skopulPoints =
      parseFloat(String(skopulPointsCell).replace(",", ".")) || 0;
  }

  return skopul;
}

// Funkcja do analizy danych Kolokwiów z arkusza
function analyzeKolokwia(sheetData, userRowIndex) {
  const kolokwia = {
    tests: [],
    percentage: "0%",
    percentageNumeric: 0,
    totalPoints: 0,
  };

  if (!sheetData || !sheetData[userRowIndex]) {
    return kolokwia;
  }

  const userRow = sheetData[userRowIndex];

  // Kolumny AQ - AX to indeksy 41 - 48 (AQ=41, AR=42, ..., AX=48) - przesunięte o 1
  for (let i = 41; i <= 48; i++) {
    const testCell = userRow[i];
    let testResult = "";

    if (testCell === undefined || testCell === null || testCell === "") {
      testResult = "Nie odbył się";
    } else {
      const cellStr = String(testCell).toLowerCase().trim();
      if (cellStr === "nb") {
        testResult = "❌ Nieobecność";
      } else if (cellStr === "nzal") {
        testResult = "⭕ Niezaliczony";
      } else {
        testResult = String(testCell) + " pkt";
      }
    }

    kolokwia.tests.push(testResult);
  }

  // Wynik procentowy z kolumny AY (indeks 49) - przesunięte o 1
  const percentageCell = userRow[49];
  if (percentageCell !== undefined && percentageCell !== null) {
    kolokwia.percentage = String(percentageCell);
    if (!kolokwia.percentage.includes("%")) {
      kolokwia.percentage += "%";
    }

    // Wyciągnij wartość numeryczną procentu
    const numericValue =
      parseFloat(String(percentageCell).replace("%", "").replace(",", ".")) ||
      0;
    kolokwia.percentageNumeric = numericValue;
  }

  // Punkty z kolumny BD (indeks 54) - przesunięte o 1
  const totalPointsCell = userRow[54];
  if (totalPointsCell !== undefined && totalPointsCell !== null) {
    kolokwia.totalPoints =
      parseFloat(String(totalPointsCell).replace(",", ".")) || 0;
  }

  return kolokwia;
}

// Funkcja do analizy danych Matur z arkusza
function analyzeMatury(sheetData, userRowIndex) {
  const matury = {
    matura1: null,
    matura2: null,
    totalPoints: 0,
    hasMaxResult: false,
  };

  if (!sheetData || !sheetData[userRowIndex]) {
    return matury;
  }

  const userRow = sheetData[userRowIndex];

  // Kolumna AY (pierwsza matura) - indeks 50 (przesunięte o 1)
  const matura1Cell = userRow[50];
  if (matura1Cell !== undefined && matura1Cell !== null && matura1Cell !== "") {
    let percentageText = String(matura1Cell);
    if (!percentageText.includes("%")) {
      percentageText += "%";
    }
    matury.matura1 = percentageText;
  }

  // Kolumna AZ (druga matura) - indeks 51 (przesunięte o 1)
  const matura2Cell = userRow[51];
  if (matura2Cell !== undefined && matura2Cell !== null && matura2Cell !== "") {
    let percentageText = String(matura2Cell);
    if (!percentageText.includes("%")) {
      percentageText += "%";
    }
    matury.matura2 = percentageText;
  }

  // Punkty łączne z kolumny BE (indeks 56) - przesunięte o 1
  const totalPointsCell = userRow[56];
  if (totalPointsCell !== undefined && totalPointsCell !== null) {
    matury.totalPoints =
      parseFloat(String(totalPointsCell).replace(",", ".")) || 0;

    // Sprawdź czy osiągnął maksymalny wynik (25/25 punktów)
    if (matury.totalPoints >= 25) {
      matury.hasMaxResult = true;
    }
  }

  return matury;
}

// Funkcja do analizy danych podsumowania z arkusza
function analyzePodsumowanie(sheetData, userRowIndex) {
  const podsumowanie = {
    frekwencja: "0%",
    skopul: "0 / 30",
    kolokwia: "0 / 25",
    aktywnosc: "0 / 20",
    matury: "0 / 25",
    wynikKoncowy: "0 / 100",
    frekwencjaNumeric: 0,
    skopulNumeric: 0,
    kolokwiaNumeric: 0,
    aktywnoscNumeric: 0,
    maturyNumeric: 0,
    wynikKoncowyNumeric: 0,
  };

  if (!sheetData || !sheetData[userRowIndex]) {
    return podsumowanie;
  }

  const userRow = sheetData[userRowIndex];

  // Kolumna BA (frekwencja procentowa) - indeks 52 (przesunięte o 1)
  const frekwencjaCell = userRow[52];
  if (frekwencjaCell !== undefined && frekwencjaCell !== null) {
    podsumowanie.frekwencja = String(frekwencjaCell);
    if (!podsumowanie.frekwencja.includes("%")) {
      podsumowanie.frekwencja += "%";
    }
    podsumowanie.frekwencjaNumeric =
      parseFloat(String(frekwencjaCell).replace("%", "").replace(",", ".")) ||
      0;
  }

  // Kolumna BB (szkopuł) - indeks 53 (przesunięte o 1)
  const skopulCell = userRow[53];
  if (skopulCell !== undefined && skopulCell !== null) {
    const skopulValue = parseFloat(String(skopulCell).replace(",", ".")) || 0;
    podsumowanie.skopul = `${skopulValue} / 30`;
    podsumowanie.skopulNumeric = skopulValue;
  }

  // Kolumna BC (kolokwia) - indeks 54 (przesunięte o 1)
  const kolokwiaCell = userRow[54];
  if (kolokwiaCell !== undefined && kolokwiaCell !== null) {
    const kolokwiaValue =
      parseFloat(String(kolokwiaCell).replace(",", ".")) || 0;
    podsumowanie.kolokwia = `${kolokwiaValue} / 25`;
    podsumowanie.kolokwiaNumeric = kolokwiaValue;
  }

  // Kolumna BD (aktywność) - indeks 55 (przesunięte o 1)
  const aktywnoscCell = userRow[55];
  if (aktywnoscCell !== undefined && aktywnoscCell !== null) {
    const aktywnoscValue =
      parseFloat(String(aktywnoscCell).replace(",", ".")) || 0;
    podsumowanie.aktywnosc = `${aktywnoscValue} / 20`;
    podsumowanie.aktywnoscNumeric = aktywnoscValue;
  }

  // Kolumna BE (matury) - indeks 56 (przesunięte o 1)
  const maturyCell = userRow[56];
  if (maturyCell !== undefined && maturyCell !== null) {
    const maturyValue = parseFloat(String(maturyCell).replace(",", ".")) || 0;
    podsumowanie.matury = `${maturyValue} / 25`;
    podsumowanie.maturyNumeric = maturyValue;
  }

  // Kolumna BF (wynik końcowy) - indeks 57 (przesunięte o 1)
  const wynikKoncowyCell = userRow[57];
  if (wynikKoncowyCell !== undefined && wynikKoncowyCell !== null) {
    const wynikKoncowyValue =
      parseFloat(String(wynikKoncowyCell).replace(",", ".")) || 0;
    podsumowanie.wynikKoncowy = `${wynikKoncowyValue} / 100`;
    podsumowanie.wynikKoncowyNumeric = wynikKoncowyValue;
  }

  return podsumowanie;
}

// Funkcja do tworzenia pierwszej strony (informacje podstawowe)
function createBasicInfoPage(userData, targetUser, targetMember, sheetData) {
  // Pobierz informacje o prowadzącym z wiersza 21 (indeks 20), kolumna B (indeks 0 w zakresie B2:BF100)
  let teacherInfo = "Brak danych";
  if (sheetData && sheetData[20]) {
    const teacherFullName = sheetData[20][0] || "";
    if (teacherFullName) {
      teacherInfo = teacherFullName.trim();
    }
  }

  return new EmbedBuilder()
    .setTitle(`👤 Profil użytkownika - Informacje podstawowe`)
    .setColor(0x3498db)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: "👤 Imię i nazwisko",
        value: userData.fullname || "Brak danych",
        inline: false,
      },
      {
        name: "🆔 Discord",
        value: `**Nazwa wyświetlana:** ${targetUser.displayName}\n**Nazwa użytkownika:** \`${targetUser.username}\``,
        inline: false,
      },
      {
        name: "📧 Email",
        value: userData.email || "Brak danych",
        inline: true,
      },
      {
        name: "🏫 Grupa",
        value: `Grupa ${userData.group}`,
        inline: true,
      },
      {
        name: "🆔 Numer indeksu",
        value: userData.numerIndeksu || "Brak danych",
        inline: true,
      },
      {
        name: "👨‍🏫 Prowadzący",
        value: teacherInfo,
        inline: false,
      }
    )
    .setTimestamp()
    .setFooter({
      text: `Strona 1/6 • Profil użytkownika ${targetUser.username}`,
      iconURL: targetUser.displayAvatarURL(),
    });
}

// Funkcja do tworzenia drugiej strony (obecność)
function createAttendancePage(targetUser, attendanceInfo, sheetData) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 Profil użytkownika - Obecność`)
    .setColor(0xe74c3c)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({
      text: `Strona 2/6 • Profil użytkownika ${targetUser.username}`,
      iconURL: targetUser.displayAvatarURL(),
    });

  if (attendanceInfo) {
    embed.addFields({
      name: "📊 Statystyki obecności",
      value:
        `**Obecności:** ${attendanceInfo.present}\n` +
        `**Nieobecności nieusprawiedliwione:** ${attendanceInfo.absentUnexcused}\n` +
        `**Nieobecności usprawiedliwione:** ${attendanceInfo.absentExcused}\n` +
        `**Zwolnieni z zajęć:** ${attendanceInfo.excused}\n` +
        `**Łączna liczba zajęć:** ${attendanceInfo.totalClasses}\n` +
        `**Frekwencja:** ${attendanceInfo.attendanceRate}`,
      inline: false,
    });

    // Dodaj nieobecności nieusprawiedliwione jeśli istnieją
    if (attendanceInfo.unexpcusedDates.length > 0) {
      const dates = attendanceInfo.unexpcusedDates.slice(0, 10);
      const datesList = dates.join(", ");
      const moreText =
        attendanceInfo.unexpcusedDates.length > 10
          ? `\n... i ${attendanceInfo.unexpcusedDates.length - 10} więcej`
          : "";

      embed.addFields({
        name: "❌ Nieobecności nieusprawiedliwione",
        value: datesList + moreText,
        inline: false,
      });
    }

    // Dodaj nieobecności usprawiedliwione jeśli istnieją
    if (attendanceInfo.excusedDates.length > 0) {
      const dates = attendanceInfo.excusedDates.slice(0, 10);
      const datesList = dates.join(", ");
      const moreText =
        attendanceInfo.excusedDates.length > 10
          ? `\n... i ${attendanceInfo.excusedDates.length - 10} więcej`
          : "";

      embed.addFields({
        name: "⚠️ Nieobecności usprawiedliwione",
        value: datesList + moreText,
        inline: false,
      });
    }

    // Dodaj zwolnienia z zajęć jeśli istnieją
    if (attendanceInfo.excusedFromClass.length > 0) {
      const dates = attendanceInfo.excusedFromClass.slice(0, 10);
      const datesList = dates.join(", ");
      const moreText =
        attendanceInfo.excusedFromClass.length > 10
          ? `\n... i ${attendanceInfo.excusedFromClass.length - 10} więcej`
          : "";

      embed.addFields({
        name: "✅ Zwolnienia z zajęć",
        value: datesList + moreText,
        inline: false,
      });
    }

    // Dodaj sekcję plusów
    const formattedPlusPoints =
      attendanceInfo.plusPoints % 2 === 0
        ? attendanceInfo.plusPoints.toString()
        : attendanceInfo.plusPoints.toFixed(2);
    const plusText = `${formattedPlusPoints} / 20`;
    let achievementText = "";

    if (attendanceInfo.plusPercentage >= 150) {
      achievementText =
        "\n\n✅ Podstawowy cel osiągnięty!\n🏆 Maksymalny wynik za punkty osiągnięty!";
    } else if (attendanceInfo.plusPercentage >= 100) {
      achievementText = "\n\n✅ Podstawowy cel osiągnięty!";
    }

    embed.addFields({
      name: "➕ Punkty aktywności",
      value: `**Ilość plusów:** ${plusText}${achievementText}`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "📊 Obecność",
      value: sheetData
        ? "❌ Nie znaleziono użytkownika w arkuszu grupy"
        : "❌ Brak danych z arkusza dla tej grupy",
      inline: false,
    });
  }

  return embed;
}

// Funkcja do tworzenia trzeciej strony (Szkopuł)
function createSkopulPage(targetUser, skopulInfo, sheetData) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Profil użytkownika - Szkopuł`)
    .setColor(0xf39c12)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({
      text: `Strona 3/6 • Profil użytkownika ${targetUser.username}`,
      iconURL: targetUser.displayAvatarURL(),
    });

  if (skopulInfo) {
    const basicTasksText = `${skopulInfo.basicTasks} pkt`;
    const maxBasicText =
      skopulInfo.maxBasicPoints > 0
        ? `**Maksymalny wynik za zadania bazowe:** ${skopulInfo.maxBasicPoints} pkt\n`
        : "";
    const totalResultText = `${skopulInfo.percentage} (${skopulInfo.skopulPoints} / 40)`;

    let achievementText = "";
    if (skopulInfo.percentageNumeric >= 120) {
      achievementText =
        "\n\n✅ Podstawowy cel osiągnięty!\n🏆 Maksymalny wynik za Szkopuła osiągnięty!";
    } else if (skopulInfo.percentageNumeric >= 100) {
      achievementText = "\n\n✅ Podstawowy cel osiągnięty!";
    }

    embed.addFields({
      name: "🏆 Wyniki ze Szkopuł",
      value:
        `**Zadania bazowe:** ${basicTasksText}\n` +
        `**Zadania dodatkowe:** ${skopulInfo.additionalTasks} pkt\n` +
        `**Suma całkowita:** ${skopulInfo.totalPoints} pkt\n` +
        maxBasicText +
        `**Wynik łączny:** ${totalResultText}` +
        achievementText,
      inline: false,
    });
  } else if (sheetData) {
    embed.addFields({
      name: "🏆 Szkopuł",
      value: "❌ Nie znaleziono danych Szkopuł w arkuszu",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🏆 Szkopuł",
      value: "❌ Brak danych z arkusza dla tej grupy",
      inline: false,
    });
  }

  return embed;
}

// Funkcja do tworzenia czwartej strony (Kolokwia)
function createKolokwiaPage(targetUser, kolokwiaInfo, sheetData) {
  const embed = new EmbedBuilder()
    .setTitle(`📝 Profil użytkownika - Kolokwia`)
    .setColor(0x9b59b6)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({
      text: `Strona 4/6 • Profil użytkownika ${targetUser.username}`,
      iconURL: targetUser.displayAvatarURL(),
    });

  if (kolokwiaInfo) {
    let testsText = "";
    let testNumber = 1;

    for (let i = 0; i < kolokwiaInfo.tests.length; i++) {
      // Pomijaj sprawdziany, które się nie odbyły
      if (kolokwiaInfo.tests[i] !== "Nie odbył się") {
        testsText += `**Sprawdzian ${testNumber}:** ${kolokwiaInfo.tests[i]}\n`;
        testNumber++;
      }
    }

    // Jeśli nie ma żadnych sprawdzianów (wszystkie się nie odbyły)
    if (testsText === "") {
      testsText = "Żaden sprawdzian się jeszcze nie odbył.\n";
    }

    const totalResultText = `${kolokwiaInfo.percentage} (${kolokwiaInfo.totalPoints} / 20)`;

    let achievementText = "";
    if (kolokwiaInfo.percentageNumeric >= 120) {
      achievementText =
        "\n\n✅ Podstawowy cel osiągnięty!\n🏆 Maksymalny wynik za Kolokwia osiągnięty!";
    } else if (kolokwiaInfo.percentageNumeric >= 100) {
      achievementText = "\n\n✅ Podstawowy cel osiągnięty!";
    }

    embed.addFields({
      name: "📝 Wyniki z Kolokwiów",
      value:
        testsText + `**Wynik łączny:** ${totalResultText}` + achievementText,
      inline: false,
    });
  } else if (sheetData) {
    embed.addFields({
      name: "📝 Kolokwia",
      value: "❌ Nie znaleziono danych Kolokwiów w arkuszu",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "📝 Kolokwia",
      value: "❌ Brak danych z arkusza dla tej grupy",
      inline: false,
    });
  }

  return embed;
}

// Funkcja do tworzenia piątej strony (Matury)
function createMaturyPage(targetUser, maturyInfo, sheetData) {
  const embed = new EmbedBuilder()
    .setTitle(`🎓 Profil użytkownika - Matury`)
    .setColor(0xe74c3c)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({
      text: `Strona 5/6 • Profil użytkownika ${targetUser.username}`,
      iconURL: targetUser.displayAvatarURL(),
    });

  if (maturyInfo) {
    let maturyText = "";

    // Dodaj wynik pierwszej matury jeśli istnieje
    if (maturyInfo.matura1) {
      maturyText += `**Matura 1:** ${maturyInfo.matura1}\n`;
    }

    // Dodaj wynik drugiej matury jeśli istnieje
    if (maturyInfo.matura2) {
      maturyText += `**Matura 2:** ${maturyInfo.matura2}\n`;
    }

    // Jeśli nie ma żadnych wyników
    if (!maturyInfo.matura1 && !maturyInfo.matura2) {
      maturyText = "Brak wyników maturalnych.\n";
    }

    const totalResultText = `${maturyInfo.totalPoints} / 20`;

    let achievementText = "";
    if (maturyInfo.hasMaxResult) {
      achievementText = "\n\n🏆 Maksymalny wynik za Matury osiągnięty!";
    }

    embed.addFields({
      name: "🎓 Wyniki Maturalne",
      value:
        maturyText + `**Wynik łączny:** ${totalResultText}` + achievementText,
      inline: false,
    });
  } else if (sheetData) {
    embed.addFields({
      name: "🎓 Matury",
      value: "❌ Nie znaleziono danych Matur w arkuszu",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🎓 Matury",
      value: "❌ Brak danych z arkusza dla tej grupy",
      inline: false,
    });
  }

  return embed;
}

// Funkcja do obliczania tieru użytkownika
function calculateTier(podsumowanieInfo) {
  if (!podsumowanieInfo)
    return { tier: "brak_danych", tierText: "❌ Brak danych", color: 0x95a5a6 };

  const frekwencja = podsumowanieInfo.frekwencjaNumeric;
  const wynikKoncowy = podsumowanieInfo.wynikKoncowyNumeric;

  // Oblicz procenty składowych
  const aktywnoscPercent = (podsumowanieInfo.aktywnoscNumeric / 20) * 100;
  const skopulPercent = (podsumowanieInfo.skopulNumeric / 40) * 100;
  const kolokwiaPercent = (podsumowanieInfo.kolokwiaNumeric / 20) * 100;
  const maturyPercent = (podsumowanieInfo.maturyNumeric / 20) * 100;

  const skladowe = [
    aktywnoscPercent,
    skopulPercent,
    kolokwiaPercent,
    maturyPercent,
  ];

  // Sprawdź minimalną frekwencję
  if (frekwencja < 80) {
    return {
      tier: "brak_kwalifikacji",
      tierText: "❌ Brak kwalifikacji do tieru",
      color: 0x95a5a6,
      reason: "Frekwencja poniżej 80%",
    };
  }

  // Sprawdź tier diamentowy (90% frekwencja, 95 pkt, 3+ składowe ≥75%)
  if (frekwencja >= 90 && wynikKoncowy >= 95) {
    const skladowePonad75 = skladowe.filter((x) => x >= 75).length;
    if (skladowePonad75 == 3) {
      return {
        tier: "diamentowy",
        tierText: "💎 Certyfikat Diamentowy",
        color: 0xb9f2ff,
        description: "Wybitne osiągnięcia w większości kategorii!",
      };
    }
    if (skladowePonad75 == 4) {
      return {
        tier: "diamentowy",
        tierText: "💎 Certyfikat Diamentowy",
        color: 0xb9f2ff,
        description: "Wybitne osiągnięcia we wszystkich kategoriach!",
      };
    }
  }

  // Sprawdź tier złoty (90% frekwencja, 80 pkt, 3+ składowe ≥50%)
  if (frekwencja >= 90 && wynikKoncowy >= 80) {
    const skladowePonad50 = skladowe.filter((x) => x >= 50).length;
    if (skladowePonad50 == 3) {
      return {
        tier: "zloty",
        tierText: "🥇 Certyfikat Złoty",
        color: 0xffd700,
        description: "Bardzo dobre wyniki w większości kategorii!",
      };
    }
    if (skladowePonad50 == 4) {
      return {
        tier: "zloty",
        tierText: "🥇 Certyfikat Złoty",
        color: 0xffd700,
        description: "Bardzo dobre wyniki we wszystkich kategoriach!",
      };
    }
  }

  // Sprawdź tier srebrny (80% frekwencja, 60 pkt, 3+ składowe ≥30%)
  if (frekwencja >= 80 && wynikKoncowy >= 60) {
    const skladowePonad30 = skladowe.filter((x) => x >= 40).length;
    if (skladowePonad30 == 3) {
      return {
        tier: "srebrny",
        tierText: "🥈 Certyfikat Srebrny",
        color: 0xc0c0c0,
        description: "Solidne wyniki w większości kategorii!",
      };
    }
    if (skladowePonad30 == 4) {
      return {
        tier: "srebrny",
        tierText: "🥈 Certyfikat Srebrny",
        color: 0xc0c0c0,
        description: "Solidne wyniki we wszystkich kategoriach!",
      };
    }
  }

  // Tier podstawowy (80% frekwencja)
  if (frekwencja >= 80) {
    return {
      tier: "podstawowy",
      tierText: "🥉 Certyfikat Sumiennego Uczestnictwa",
      color: 0xcd7f32,
      description: "Podstawowe wymagania spełnione!",
    };
  }

  return {
    tier: "brak_kwalifikacji",
    tierText: "❌ Brak kwalifikacji do certyfikatu",
    color: 0x95a5a6,
    reason: "Niewystarczające wyniki",
  };
}

// Funkcja do tworzenia szóstej strony (Podsumowanie)
function createPodsumowaniePage(targetUser, podsumowanieInfo, sheetData) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 Profil użytkownika - Podsumowanie`)
    .setColor(0x2c3e50)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({
      text: `Strona 6/6 • Profil użytkownika ${targetUser.username}`,
      iconURL: targetUser.displayAvatarURL(),
    });

  if (podsumowanieInfo) {
    // Główne statystyki
    embed.addFields({
      name: "📊 Szczegółowe wyniki",
      value:
        `**📈 Frekwencja:** ${podsumowanieInfo.frekwencja}\n` +
        `**🏆 Szkopuł:** ${podsumowanieInfo.skopul}\n` +
        `**📝 Kolokwia:** ${podsumowanieInfo.kolokwia}\n` +
        `**➕ Aktywność:** ${podsumowanieInfo.aktywnosc}\n` +
        `**🎓 Matury:** ${podsumowanieInfo.matury}`,
      inline: false,
    });

    // Wynik końcowy z wyróżnieniem
    let wynikKoncowyText = `**${podsumowanieInfo.wynikKoncowy}**`;

    // Oblicz tier użytkownika
    const tierInfo = calculateTier(podsumowanieInfo);

    // Zmień kolor embed na kolor tieru
    embed.setColor(tierInfo.color);

    embed.addFields({
      name: "🏆 Wynik końcowy",
      value: wynikKoncowyText,
      inline: false,
    });

    // Dodaj sekcję tieru
    let tierText = tierInfo.tierText;
    if (tierInfo.description) {
      tierText += `\n${tierInfo.description}`;
    }
    if (tierInfo.reason) {
      tierText += `\n*Powód: ${tierInfo.reason}*`;
    }

    embed.addFields({
      name: "🥇 Tier użytkownika",
      value: tierText,
      inline: false,
    });
  } else if (sheetData) {
    embed.addFields({
      name: "📋 Podsumowanie",
      value: "❌ Nie znaleziono danych podsumowania w arkuszu",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "📋 Podsumowanie",
      value: "❌ Brak danych z arkusza dla tej grupy",
      inline: false,
    });
  }

  return embed;
}

// Funkcja do tworzenia przycisków nawigacji
function createNavigationButtons(currentPage) {
  // Pierwszy rząd przycisków (strony 1-3)
  const row1 = new ActionRowBuilder();

  const basicButton = new ButtonBuilder()
    .setCustomId("profile_page_1")
    .setLabel("👤 Podstawowe")
    .setStyle(currentPage === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const attendanceButton = new ButtonBuilder()
    .setCustomId("profile_page_2")
    .setLabel("📊 Frekwencja")
    .setStyle(currentPage === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const skopulButton = new ButtonBuilder()
    .setCustomId("profile_page_3")
    .setLabel("🏆 Szkopuł")
    .setStyle(currentPage === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary);

  row1.addComponents(basicButton, attendanceButton, skopulButton);

  // Drugi rząd przycisków (strony 4-6)
  const row2 = new ActionRowBuilder();

  const kolokwiaButton = new ButtonBuilder()
    .setCustomId("profile_page_4")
    .setLabel("📝 Kolokwia")
    .setStyle(currentPage === 4 ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const maturyButton = new ButtonBuilder()
    .setCustomId("profile_page_5")
    .setLabel("🎓 Matury")
    .setStyle(currentPage === 5 ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const summaryButton = new ButtonBuilder()
    .setCustomId("profile_page_6")
    .setLabel("📋 Podsumowanie")
    .setStyle(currentPage === 6 ? ButtonStyle.Primary : ButtonStyle.Secondary);

  row2.addComponents(kolokwiaButton, maturyButton, summaryButton);

  return [row1, row2];
}

// Funkcja do znajdowania użytkownika w arkuszu po numerze indeksu
function findUserInSheet(sheetData, numerIndeksu) {
  if (!sheetData || !numerIndeksu) return -1;

  for (let i = 0; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.length < 2) continue;

    // Struktura arkusza: B=imię(0), C=numer_indeksu(1), D=szkopul_id(2)
    const numerIndeksuZArkusza = String(row[1] || "").trim();

    if (numerIndeksuZArkusza === numerIndeksu) {
      return i;
    }
  }

  return -1;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profil")
    .setDescription("Wyświetl profil użytkownika z danymi i obecnością")
    .addUserOption((option) =>
      option
        .setName("użytkownik")
        .setDescription("Użytkownik którego profil chcesz sprawdzić")
        .setRequired(false)
    )
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(interaction, "profil");
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Sprawdź uprawnienia (stary kod dla kompatybilności)
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

    // Określ docelowego użytkownika na podstawie uprawnień
    let targetUser;
    const providedUser = interaction.options.getUser("użytkownik");

    if (hasStudentRole && !hasTeacherRole && !hasAdminRole) {
      // Tylko uczeń - może sprawdzić tylko swój profil
      if (providedUser && providedUser.id !== interaction.user.id) {
        return interaction.reply({
          content: "❌ Uczniowie mogą sprawdzać tylko swój własny profil.",
          flags: MessageFlags.Ephemeral,
        });
      }
      targetUser = interaction.user;
    } else {
      // Nauczyciel/admin - może sprawdzić profil innego użytkownika
      if (!providedUser) {
        return interaction.reply({
          content:
            "❌ Nauczyciele i administratorzy muszą podać użytkownika do sprawdzenia.",
          flags: MessageFlags.Ephemeral,
        });
      }
      targetUser = providedUser;
    }

    // Sprawdź czy target to bot
    if (targetUser.bot) {
      return interaction.reply({
        content: "❌ Boty nie mają profili!",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Pobierz dane użytkownika z bazy
      const userData = await getUserByDiscordId(targetUser.id);

      if (!userData) {
        return interaction.reply({
          content: `❌ Nie znaleziono danych użytkownika ${targetUser.displayName} w bazie danych.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Pobierz dane z cache arkuszy
      const sheetsCache = getSheetsCache();
      const sheetName = `Grupa${userData.group}`;
      const sheetData = sheetsCache[sheetName];

      let attendanceInfo = null;
      let skopulInfo = null;
      let kolokwiaInfo = null;
      let maturyInfo = null;
      let podsumowanieInfo = null;

      if (sheetData && sheetData.length > 0) {
        const userRowIndex = findUserInSheet(sheetData, userData.numerIndeksu);

        if (userRowIndex !== -1) {
          attendanceInfo = analyzeAttendance(sheetData, userRowIndex);
          skopulInfo = analyzeSkopul(sheetData, userRowIndex);
          kolokwiaInfo = analyzeKolokwia(sheetData, userRowIndex);
          maturyInfo = analyzeMatury(sheetData, userRowIndex);
          podsumowanieInfo = analyzePodsumowanie(sheetData, userRowIndex);
        }
      }

      // Pobierz informacje o członku serwera
      const targetMember = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);

      // Utwórz pierwszą stronę (informacje podstawowe)
      let currentPage = 1;
      const embed = createBasicInfoPage(
        userData,
        targetUser,
        targetMember,
        sheetData
      );
      const buttons = createNavigationButtons(currentPage);

      // Wyślij wiadomość z przyciskami (tylko dla wywołującego)
      const message = await interaction.reply({
        embeds: [embed],
        components: buttons,
        flags: MessageFlags.Ephemeral,
      });

      // Utwórz collector dla przycisków
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minut
      });

      collector.on("collect", async (buttonInteraction) => {
        // Sprawdź czy użytkownik ma prawo do nawigacji
        if (buttonInteraction.user.id !== interaction.user.id) {
          return buttonInteraction.reply({
            content:
              "❌ Tylko osoba która wywołała komendę może nawigować po profilu.",
            flags: MessageFlags.Ephemeral,
          });
        }

        // Nawigacja po stronach - bezpośrednie przejścia
        if (buttonInteraction.customId.startsWith("profile_page_")) {
          const targetPage = parseInt(
            buttonInteraction.customId.replace("profile_page_", "")
          );
          if (targetPage >= 1 && targetPage <= 6) {
            currentPage = targetPage;
          }
        }

        // Utwórz odpowiednią stronę
        let newEmbed;
        switch (currentPage) {
          case 1:
            newEmbed = createBasicInfoPage(
              userData,
              targetUser,
              targetMember,
              sheetData
            );
            break;
          case 2:
            newEmbed = createAttendancePage(
              targetUser,
              attendanceInfo,
              sheetData
            );
            break;
          case 3:
            newEmbed = createSkopulPage(targetUser, skopulInfo, sheetData);
            break;
          case 4:
            newEmbed = createKolokwiaPage(targetUser, kolokwiaInfo, sheetData);
            break;
          case 5:
            newEmbed = createMaturyPage(targetUser, maturyInfo, sheetData);
            break;
          case 6:
            newEmbed = createPodsumowaniePage(
              targetUser,
              podsumowanieInfo,
              sheetData
            );
            break;
        }

        const newButtons = createNavigationButtons(currentPage);

        await buttonInteraction.update({
          embeds: [newEmbed],
          components: newButtons,
        });
      });

      collector.on("end", () => {
        // Wyłącz przyciski po zakończeniu
        const disabledButtons = createNavigationButtons(currentPage);
        disabledButtons.forEach((row) => {
          row.components.forEach((button) => button.setDisabled(true));
        });

        message
          .edit({
            components: disabledButtons,
          })
          .catch(() => {}); // Ignoruj błędy jeśli wiadomość została usunięta
      });
    } catch (error) {
      console.error("[PROFIL] Błąd:", error);

      // Sprawdź czy już odpowiedziałeś
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "❌ Wystąpił błąd podczas pobierania profilu użytkownika.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: "❌ Wystąpił błąd podczas pobierania profilu użytkownika.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
