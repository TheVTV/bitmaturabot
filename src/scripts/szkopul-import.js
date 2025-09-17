const axios = require("axios");
const cheerio = require("cheerio");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

// Import bazy danych
const { getAllUsers } = require("../db/users_mysql");
const { initDatabase } = require("../db/database");

// Import arkuszy Google Sheets
const { getSheetsCache } = require("./import-points-from-sheets");

// Ścieżki do konfiguracji Google Sheets
const CREDENTIALS_PATH = path.join(__dirname, "../../credentials.json");
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// --- KONFIGURACJA ---
const LOGIN_URL = "https://szkopul.edu.pl/login/";

// === RANKING URLS CONFIGURATION ===
const RANKING_URLS = {
  podstawowy:
    process.env.SZKOPUL_RANKING_PODSTAWOWY ||
    "https://szkopul.edu.pl/c/bit-matura-25-26-podstawowy/ranking",
  sredni:
    process.env.SZKOPUL_RANKING_SREDNI ||
    "https://szkopul.edu.pl/c/bit-matura-25-26-sredni/ranking",
  zaawansowany:
    process.env.SZKOPUL_RANKING_ZAAWANSOWANY ||
    "https://szkopul.edu.pl/c/bit-matura-25-26-zaawansowani/ranking",
};

// === DANE LOGOWANIA ===
const USERNAME = process.env.SZKOPUL_USERNAME;
const PASSWORD = process.env.SZKOPUL_PASSWORD;

// === MAPOWANIE GRUP NA POZIOMY ===
const GROUP_LEVELS = {
  podstawowy: (process.env.GROUPS_PODSTAWOWY || "1,2,3")
    .split(",")
    .map((g) => g.trim())
    .map(Number),
  sredniozaawansowany: (
    process.env.GROUPS_SREDNIOZAAWANSOWANY || "4,5,6,7,8,9,12"
  )
    .split(",")
    .map((g) => g.trim())
    .map(Number),
  zaawansowany: (process.env.GROUPS_ZAAWANSOWANY || "10,11")
    .split(",")
    .map((g) => g.trim())
    .map(Number),
};

// === MNOŻNIKI PUNKTÓW ===
const MULTIPLIERS = {
  podstawowy: {
    podstawowy: 100, // Za swój poziom zawsze 100%
    sredniozaawansowany: parseInt(
      process.env.MULTIPLIER_PODSTAWOWY_FOR_SREDNI || "10"
    ),
    zaawansowany: parseInt(
      process.env.MULTIPLIER_PODSTAWOWY_FOR_ZAAWANSOWANY || "40"
    ),
  },
  sredniozaawansowany: {
    podstawowy: parseInt(process.env.MULTIPLIER_SREDNI_FOR_PODSTAWOWY || "10"),
    sredniozaawansowany: 100, // Za swój poziom zawsze 100%
    zaawansowany: parseInt(
      process.env.MULTIPLIER_SREDNI_FOR_ZAAWANSOWANY || "20"
    ),
  },
  zaawansowany: {
    podstawowy: parseInt(
      process.env.MULTIPLIER_ZAAWANSOWANY_FOR_PODSTAWOWY || "10"
    ),
    sredniozaawansowany: parseInt(
      process.env.MULTIPLIER_ZAAWANSOWANY_FOR_SREDNI || "20"
    ),
    zaawansowany: 100, // Za swój poziom zawsze 100%
  },
};

// Sprawdź czy dane logowania są załadowane
if (!USERNAME || !PASSWORD) {
  console.error(
    "[CONFIG] Błąd: Brak danych logowania w zmiennych środowiskowych!"
  );
  console.error(
    "Sprawdź czy plik .env zawiera SZKOPUL_USERNAME i SZKOPUL_PASSWORD"
  );
  process.exit(1);
}

console.log(`[CONFIG] Załadowano dane logowania dla użytkownika: ${USERNAME}`);

/**
 * Funkcja do określania poziomu użytkownika na podstawie grupy
 */
function getUserLevel(groupNumber) {
  if (GROUP_LEVELS.podstawowy.includes(groupNumber)) {
    return "podstawowy";
  } else if (GROUP_LEVELS.sredniozaawansowany.includes(groupNumber)) {
    return "sredniozaawansowany";
  } else if (GROUP_LEVELS.zaawansowany.includes(groupNumber)) {
    return "zaawansowany";
  }
  return null;
}

/**
 * Funkcja do obliczania punktów z uwzględnieniem mnożników
 */
function calculateAdjustedPoints(rawPoints, userLevel, contestLevel) {
  if (!userLevel || !MULTIPLIERS[userLevel]) {
    return rawPoints;
  }

  const multiplier = MULTIPLIERS[userLevel][contestLevel] || 100;
  return Math.round((rawPoints * multiplier) / 100);
}

/**
 * Funkcja do pobierania danych użytkowników z bazy danych
 */
async function getUsersFromDatabase() {
  try {
    const users = await getAllUsers();

    // Tworzenie mapy szkopul-id -> dane użytkownika
    const userMap = new Map();

    let usersWithSzkopulId = 0;
    users.forEach((user) => {
      if (user.szkopul_id) {
        userMap.set(user.szkopul_id.toString(), {
          name: user.name,
          groupNumber: user.group_number,
          level: getUserLevel(user.group_number),
        });
        usersWithSzkopulId++;
      }
    });

    console.log(
      `[DB] Załadowano ${usersWithSzkopulId} użytkowników ze szkopul-id`
    );

    return userMap;
  } catch (error) {
    console.error("[DB] Błąd pobierania użytkowników z bazy:", error.message);
    return new Map();
  }
}

/**
 * Funkcja do autoryzacji Google Sheets API
 */
async function authorizeGoogleSheets() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const auth = new google.auth.GoogleAuth({ credentials, scopes });
  return await auth.getClient();
}

/**
 * Funkcja do znajdowania użytkownika w arkuszu (skopiowana z profil.js)
 */
function findUserInSheet(sheetData, fullname) {
  if (!sheetData || !fullname) return -1;

  const nameParts = fullname.toLowerCase().split(" ");

  for (let i = 0; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.length < 2) continue;

    const firstName = String(row[0] || "")
      .toLowerCase()
      .trim();
    const lastName = String(row[1] || "")
      .toLowerCase()
      .trim();

    if (firstName && lastName) {
      // Sprawdź czy imię z arkusza występuje w fullname
      const hasFirstName = nameParts.includes(firstName);

      // Sprawdź nazwisko - może być jako jeden ciąg lub jako części
      let hasLastName = false;

      // Przypadek 1: Nazwisko jako jeden ciąg (np. "wójcik alt")
      const lastNameParts = lastName.split(" ");
      if (lastNameParts.length > 1) {
        // Sprawdź czy wszystkie części nazwiska z arkusza występują w fullname
        hasLastName = lastNameParts.every((part) => nameParts.includes(part));
      } else {
        // Przypadek 2: Zwykłe nazwisko (jedna część)
        hasLastName = nameParts.includes(lastName);
      }

      if (hasFirstName && hasLastName) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Funkcja do aktualizacji punktów w arkuszu Google Sheets
 */
async function updateUserPointsInSheet(
  groupNumber,
  userName,
  basePoints,
  bonusPoints
) {
  try {
    const authClient = await authorizeGoogleSheets();
    const sheets = google.sheets({ version: "v4", auth: authClient });

    const sheetName = `Grupa${groupNumber}`;

    // Pobierz dane z arkusza, żeby znaleźć użytkownika
    const range = `${sheetName}!B2:BF100`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const sheetData = response.data.values || [];
    const userRowIndex = findUserInSheet(sheetData, userName);

    if (userRowIndex === -1) {
      return false;
    }

    // Oblicz rzeczywisty numer wiersza (dodaj 2 bo zaczynamy od B2)
    const actualRowNumber = userRowIndex + 2;

    // Kolumny AL i AM to indeksy 37 i 38 (licząc od A=0)
    const basePointsRange = `${sheetName}!AL${actualRowNumber}`;
    const bonusPointsRange = `${sheetName}!AM${actualRowNumber}`;

    // Aktualizuj punkty bazowe (kolumna AL)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: basePointsRange,
      valueInputOption: "RAW",
      resource: {
        values: [[basePoints]],
      },
    });

    // Aktualizuj punkty dodatkowe (kolumna AM)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: bonusPointsRange,
      valueInputOption: "RAW",
      resource: {
        values: [[bonusPoints]],
      },
    });

    return true;
  } catch (error) {
    console.error(
      `[ARKUSZ] Błąd aktualizacji arkusza dla ${userName}:`,
      error.message
    );
    return false;
  }
}

/**
 * Funkcja do generowania raportu użytkowników z uwzględnieniem poziomów i mnożników
 */
async function generateUserRankingReport() {
  try {
    console.log("[SZKOPUL] Rozpoczynam import danych ze Szkopuł...");

    // Inicjalizuj bazę danych
    await initDatabase();

    // Pobierz dane użytkowników z bazy
    const usersMap = await getUsersFromDatabase();

    // Pobierz dane rankingu z szkopuł
    const rankingData = await fetchSzkopulRanking();

    if (!rankingData || rankingData.length === 0) {
      console.log("[SZKOPUL] Brak danych rankingu ze szkopuł");
      return;
    }

    // Przetwórz dane z uwzględnieniem mnożników
    const processedUsers = rankingData.map((user) => {
      const userInfo = usersMap.get(user.userId);

      if (!userInfo) {
        // Użytkownik nie ma konta w bazie
        return {
          userId: user.userId,
          name: `Nieznany (ID: ${user.userId})`,
          level: "nieznany",
          groupNumber: null,
          rawPoints: {
            podstawowy: user.podstawowy,
            sredni: user.sredni,
            zaawansowany: user.zaawansowany,
          },
          adjustedPoints: {
            podstawowy: user.podstawowy,
            sredni: user.sredni,
            zaawansowany: user.zaawansowany,
          },
          totalRaw: user.suma,
          totalAdjusted: user.suma,
        };
      }

      // Oblicz przeliczone punkty
      const adjustedPodstawowy = calculateAdjustedPoints(
        user.podstawowy,
        userInfo.level,
        "podstawowy"
      );
      const adjustedSredni = calculateAdjustedPoints(
        user.sredni,
        userInfo.level,
        "sredniozaawansowany"
      );
      const adjustedZaawansowany = calculateAdjustedPoints(
        user.zaawansowany,
        userInfo.level,
        "zaawansowany"
      );

      // Oblicz punkty bazowe (ze swojego poziomu) i dodatkowe (z pozostałych poziomów)
      let basePoints = 0;
      let bonusPoints = 0;

      switch (userInfo.level) {
        case "podstawowy":
          basePoints = adjustedPodstawowy; // Pełne punkty za swój poziom
          bonusPoints = adjustedSredni + adjustedZaawansowany; // Zredukowane za inne poziomy
          break;
        case "sredniozaawansowany":
          basePoints = adjustedSredni; // Pełne punkty za swój poziom
          bonusPoints = adjustedPodstawowy + adjustedZaawansowany; // Zredukowane za inne poziomy
          break;
        case "zaawansowany":
          basePoints = adjustedZaawansowany; // Pełne punkty za swój poziom
          bonusPoints = adjustedPodstawowy + adjustedSredni; // Zredukowane za inne poziomy
          break;
      }

      const totalAdjusted = basePoints + bonusPoints;

      return {
        userId: user.userId,
        name: userInfo.name,
        level: userInfo.level,
        groupNumber: userInfo.groupNumber,
        rawPoints: {
          podstawowy: user.podstawowy,
          sredni: user.sredni,
          zaawansowany: user.zaawansowany,
        },
        adjustedPoints: {
          podstawowy: adjustedPodstawowy,
          sredni: adjustedSredni,
          zaawansowany: adjustedZaawansowany,
        },
        basePoints: basePoints, // Punkty ze swojego poziomu
        bonusPoints: bonusPoints, // Punkty z innych poziomów
        totalRaw: user.suma,
        totalAdjusted: totalAdjusted,
      };
    });

    // Sortuj według przeliczonych punktów
    processedUsers.sort((a, b) => b.totalAdjusted - a.totalAdjusted);

    // Podstawowe statystyki
    const levelStats = processedUsers.reduce((stats, user) => {
      stats[user.level] = (stats[user.level] || 0) + 1;
      return stats;
    }, {});

    console.log(
      `[SZKOPUL] Przetworzono ${processedUsers.length} użytkowników w rankingu`
    );

    // === AKTUALIZACJA ARKUSZY GOOGLE SHEETS ===
    console.log("[ARKUSZ] Aktualizacja arkuszy Google Sheets...");
    let updatedCount = 0;
    let failedCount = 0;

    for (const user of processedUsers) {
      if (user.groupNumber) {
        const success = await updateUserPointsInSheet(
          user.groupNumber,
          user.name,
          user.basePoints,
          user.bonusPoints
        );

        if (success) {
          updatedCount++;
        } else {
          failedCount++;
        }

        // Dodaj krótkie opóźnienie między zapytaniami do API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        failedCount++;
      }
    }

    console.log(
      `[ARKUSZ] Zaktualizowano: ${updatedCount}/${processedUsers.length} użytkowników`
    );

    return processedUsers;
  } catch (error) {
    console.error(
      "[ARKUSZ] Błąd podczas generowania raportu użytkowników:",
      error.message
    );
    throw error;
  }
}

/**
 * Funkcja do pobierania rankingu z jednego konkretnego URL-a używając istniejącej sesji
 */
async function fetchSingleRankingWithSession(
  axiosInstance,
  rankingUrl,
  contestName = ""
) {
  try {
    console.log(
      `[SZKOPUL] Pobieranie rankingu${
        contestName ? ` (${contestName})` : ""
      }...`
    );

    const rankingResponse = await axiosInstance.get(rankingUrl, {
      headers: {
        Referer: LOGIN_URL,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    const rankingPage = cheerio.load(rankingResponse.data);

    // Sprawdź czy nie zostaliśmy przekierowani z powrotem na stronę logowania
    if (
      rankingResponse.data.includes("login") &&
      rankingResponse.data.includes("password")
    ) {
      throw new Error(
        "Zostaliśmy przekierowani z powrotem na stronę logowania"
      );
    }

    // Znajdź tabelę rankingu (dodajmy debugowanie)
    let table = rankingPage("table");

    if (table.length === 0) {
      table = rankingPage("table.table");
      if (table.length === 0) {
        table = rankingPage(".table");
        if (table.length === 0) {
          const tableResponsive = rankingPage(".table-responsive table");
          const containerTables = rankingPage(
            ".container table, .content table"
          );

          if (tableResponsive.length > 0) {
            table = tableResponsive;
          } else if (containerTables.length > 0) {
            table = containerTables;
          } else {
            throw new Error(
              `Nie znaleziono tabeli rankingu na stronie${
                contestName ? ` (${contestName})` : ""
              }`
            );
          }
        }
      }
    }

    const rankingData = [];

    // Parsowanie danych z tabeli - tylko kolumny 2 (ID użytkownika) i 3 (punkty)
    table.find("tr").each((index, row) => {
      const cells = rankingPage(row).find("td");
      const headers = rankingPage(row).find("th");

      // Pomiń wiersz z nagłówkami (th)
      if (headers.length > 0) {
        return;
      }

      if (cells.length >= 3) {
        // Kolumna 2 (indeks 1) - wyciągnij ID użytkownika z linku lub użyj indeksu
        let userId = null;
        const userCell = cells.eq(1);
        const link = userCell.find("a");

        if (link.length > 0) {
          const href = link.attr("href");
          if (href) {
            // Wyciągnij ID użytkownika - liczby po ostatnim /
            const matches = href.match(/\/(\d+)\/?$/);
            if (matches) {
              userId = matches[1];
            }
          }
        }

        // Jeśli nie udało się wyciągnąć ID z linku, sprawdź czy w nazwie użytkownika nie ma ID
        if (!userId) {
          // Jeśli nie ma linku, sprawdź czy pierwszy wiersz ma numerację i użyj jej jako fallback
          const userName = userCell.text().trim();
          // Na razie pomijamy wiersze bez ID
          return;
        }

        // Kolumna 3 (indeks 2) - punkty
        const points = cells.eq(2).text().trim();

        // Dodaj tylko ID użytkownika i punkty
        rankingData.push([userId, points]);
      }
    });

    console.log(
      `[SZKOPUL] Ranking${
        contestName ? ` (${contestName})` : ""
      } został pobrany - ${rankingData.length} wierszy`
    );
    return rankingData;
  } catch (error) {
    console.error(
      `[SZKOPUL] Błąd podczas pobierania rankingu${
        contestName ? ` (${contestName})` : ""
      }:`,
      error.message
    );
    throw error;
  }
}

/**
 * Funkcja do pobierania rankingu ze wszystkich trzech konkursów i mergowania wyników
 * Używa jednej sesji logowania dla wszystkich rankingów
 */
async function fetchSzkopulRanking() {
  try {
    console.log(
      "[SZKOPUL] Rozpoczynam pobieranie danych ze wszystkich trzech konkursów...\n"
    );

    // Tworzenie jednej sesji z axios i zarządzanie ciasteczkami
    const cookieJar = {};
    const axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      maxRedirects: 5,
    });

    // Interceptor do zarządzania ciasteczkami
    axiosInstance.interceptors.response.use((response) => {
      const setCookieHeader = response.headers["set-cookie"];
      if (setCookieHeader) {
        setCookieHeader.forEach((cookie) => {
          const [nameValue] = cookie.split(";");
          const [name, value] = nameValue.split("=");
          if (name && value) {
            cookieJar[name.trim()] = value.trim();
          }
        });
      }
      return response;
    });

    axiosInstance.interceptors.request.use((config) => {
      const cookies = Object.entries(cookieJar)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
      if (cookies) {
        config.headers.Cookie = cookies;
      }
      return config;
    });

    // 1. LOGOWANIE - tylko raz na początku
    console.log("[AUTH] Logowanie do Szkopuł...");

    // Pobierz stronę logowania, żeby zdobyć CSRF token
    const loginPageResponse = await axiosInstance.get(LOGIN_URL);
    const $ = cheerio.load(loginPageResponse.data);
    const csrfToken = $('input[name="csrfmiddlewaretoken"]').val();
    const form = $("form");

    if (!csrfToken) {
      throw new Error("Nie można znaleźć CSRF token na stronie logowania");
    }

    // Przygotuj dane formularza
    const loginPayload = {};
    form.find('input[type="hidden"]').each((i, element) => {
      const name = $(element).attr("name");
      const value = $(element).attr("value");
      if (name && value !== undefined) {
        loginPayload[name] = value;
      }
    });

    loginPayload["auth-username"] = USERNAME;
    loginPayload["auth-password"] = PASSWORD;

    if (!loginPayload["login_view-current_step"]) {
      loginPayload["login_view-current_step"] = "auth";
    }

    const loginResponse = await axiosInstance.post(
      LOGIN_URL,
      new URLSearchParams(loginPayload).toString(),
      {
        headers: {
          Referer: LOGIN_URL,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        },
      }
    );

    // Sprawdź czy logowanie się powiodło
    if (loginResponse.status === 302 || loginResponse.status === 301) {
      const redirectLocation = loginResponse.headers.location;
      if (!redirectLocation || redirectLocation.includes("login")) {
      }
      console.log("[AUTH] Logowanie udane");
    } else if (loginResponse.status === 200) {
      if (
        responseText.includes("auth-username") ||
        responseText.includes("auth-password")
      ) {
        throw new Error("Logowanie nie powiodło się - sprawdź dane logowania");
      }
      console.log("[AUTH] Logowanie udane");
    }

    // 2. POBIERANIE RANKINGÓW - po kolei używając tej samej sesji
    console.log("[SZKOPUL] Pobieranie rankingów...");

    const podstawowyData = await fetchSingleRankingWithSession(
      axiosInstance,
      RANKING_URLS.podstawowy,
      "podstawowy"
    ).catch((err) => {
      console.error("Błąd pobierania rankingu podstawowego:", err.message);
      return [];
    });

    const sredniData = await fetchSingleRankingWithSession(
      axiosInstance,
      RANKING_URLS.sredni,
      "średni"
    ).catch((err) => {
      console.error("Błąd pobierania rankingu średniego:", err.message);
      return [];
    });

    const zaawansowanyData = await fetchSingleRankingWithSession(
      axiosInstance,
      RANKING_URLS.zaawansowany,
      "zaawansowany"
    ).catch((err) => {
      console.error("Błąd pobierania rankingu zaawansowanego:", err.message);
      return [];
    });

    // Tworzenie mapy użytkowników z wszystkich konkursów
    const userMap = new Map();

    // Dodaj użytkowników z konkursu podstawowego
    podstawowyData.forEach(([userId, points]) => {
      if (!userMap.has(userId)) {
        userMap.set(userId, { podstawowy: 0, sredni: 0, zaawansowany: 0 });
      }
      userMap.get(userId).podstawowy = parseInt(points) || 0;
    });

    // Dodaj użytkowników z konkursu średniego
    sredniData.forEach(([userId, points]) => {
      if (!userMap.has(userId)) {
        userMap.set(userId, { podstawowy: 0, sredni: 0, zaawansowany: 0 });
      }
      userMap.get(userId).sredni = parseInt(points) || 0;
    });

    // Dodaj użytkowników z konkursu zaawansowanego
    zaawansowanyData.forEach(([userId, points]) => {
      if (!userMap.has(userId)) {
        userMap.set(userId, { podstawowy: 0, sredni: 0, zaawansowany: 0 });
      }
      userMap.get(userId).zaawansowany = parseInt(points) || 0;
    });

    // Konwertuj mapę na tablicę z sumą punktów i sortuj według sumy
    const mergedData = Array.from(userMap.entries())
      .map(([userId, scores]) => {
        const suma = scores.podstawowy + scores.sredni + scores.zaawansowany;
        return {
          userId,
          podstawowy: scores.podstawowy,
          sredni: scores.sredni,
          zaawansowany: scores.zaawansowany,
          suma,
        };
      })
      .sort((a, b) => b.suma - a.suma); // Sortuj malejąco według sumy

    // Wyświetl podstawowe statystyki
    if (mergedData.length > 0) {
      console.log(
        `[SZKOPUL] Pobrano dane ${mergedData.length} użytkowników z rankingów`
      );
    } else {
      console.log("[SZKOPUL] Brak danych we wszystkich konkursach");
    }

    return mergedData;
  } catch (error) {
    console.error(
      "Błąd podczas pobierania i mergowania rankingów:",
      error.message
    );
    throw error;
  }
}

/**
 * Główna funkcja eksportowana
 */
async function importSzkopulData() {
  try {
    const rankingData = await generateUserRankingReport();
    return rankingData;
  } catch (error) {
    console.error("Błąd podczas importu danych ze szkopuł:", error.message);
    return null;
  }
}

// Jeśli plik jest uruchamiany bezpośrednio (nie importowany)
if (require.main === module) {
  importSzkopulData()
    .then(() => {
      console.log("Import zakończony");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Błąd:", error);
      process.exit(1);
    });
}

module.exports = {
  importSzkopulData,
  fetchSzkopulRanking,
  generateUserRankingReport,
  getUserLevel,
  calculateAdjustedPoints,
};
