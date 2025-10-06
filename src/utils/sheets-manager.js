const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const CREDENTIALS_PATH = path.join(__dirname, "../../credentials.json");
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

/**
 * Autoryzuje dostęp do Google Sheets API
 */
async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const auth = new google.auth.GoogleAuth({ credentials, scopes });
  return await auth.getClient();
}

/**
 * Znajduje ucznia w arkuszu Google Sheets na podstawie imienia i numeru indeksu.
 * Kolumna B zawiera imię, kolumna C zawiera numer indeksu.
 */
async function findStudentInSheetByNameAndIndex(
  groupNumber,
  studentName,
  numerIndeksu
) {
  try {
    if (!SPREADSHEET_ID) {
      console.error(
        "SPREADSHEET_ID nie jest ustawiony w zmiennych środowiskowych"
      );
      return { row: null, found: false };
    }

    const authClient = await authorize();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const sheetName = `Grupa${groupNumber}`;

    // Pobierz dane z kolumn B (imię) i C (numer indeksu) od wiersza 2 do 100
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!B2:C100`,
    });

    const rows = response.data.values || [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const imie = row[0] ? row[0].trim() : ""; // Kolumna B
      const indeks = row[1] ? row[1].trim() : ""; // Kolumna C

      if (!imie || !indeks) continue;

      // Sprawdź czy imię i numer indeksu pasują
      if (imie === studentName && indeks === numerIndeksu) {
        console.log(
          `Znaleziono ucznia "${studentName}" (indeks: ${numerIndeksu}) w arkuszu grupy ${groupNumber}, wiersz ${
            i + 2
          }`
        );
        return { row: i + 2, found: true };
      }
    }

    console.log(
      `Nie znaleziono ucznia "${studentName}" z numerem indeksu "${numerIndeksu}" w arkuszu grupy ${groupNumber}`
    );
    console.log(`Dostępni uczniowie w arkuszu (pierwsze 10):`);
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row && row.length >= 2) {
        const imie = row[0] ? row[0].trim() : ""; // Kolumna B
        const indeks = row[1] ? row[1].trim() : ""; // Kolumna C

        if (imie && indeks) {
          console.log(`- imię: "${imie}", indeks: "${indeks}"`);
        }
      }
    }

    return { row: null, found: false };
  } catch (error) {
    console.error(
      `Błąd podczas szukania ucznia w arkuszu grupy ${groupNumber}:`,
      error
    );
    return { row: null, found: false };
  }
}

/**
 * Znajduje ucznia w arkuszu na podstawie imienia i nazwiska (NIEPOPRAWNA METODA)
 * UWAGA: Ta metoda zakłada że kolumna C zawiera nazwisko, ale faktycznie zawiera numer indeksu.
 * Używana tylko dla kompatybilności wstecznej.
 * @param {string|number} groupNumber - Numer grupy
 * @param {string} fullName - Pełne imię i nazwisko ucznia
 * @returns {Promise<{row: number, found: boolean}>} - Numer wiersza ucznia lub -1 jeśli nie znaleziono
 */
async function findStudentInSheet(groupNumber, fullName) {
  try {
    if (!SPREADSHEET_ID) {
      console.error(
        "SPREADSHEET_ID nie jest ustawiony w zmiennych środowiskowych"
      );
      return { row: -1, found: false };
    }

    const authClient = await authorize();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const sheetName = `Grupa${groupNumber}`;

    // Pobierz kolumny B i C (imię i nazwisko) od wiersza 2 do 100
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!B2:C100`,
    });

    const rows = response.data.values || [];

    console.log(`Szukanie ucznia "${fullName}" w arkuszu grupy ${groupNumber}`);

    // Szukaj dopasowania podobnie jak w import-points-from-sheets.js
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const imie = row[0] ? row[0].trim() : ""; // Kolumna B
      const nazwisko = row[1] ? row[1].trim() : ""; // Kolumna C

      if (!imie || !nazwisko) continue;

      // Użyj tej samej logiki co w import-points-from-sheets.js:
      // sprawdź czy fullname zawiera zarówno imię jak i nazwisko
      if (fullName.includes(imie) && fullName.includes(nazwisko)) {
        console.log(
          `Znaleziono ucznia "${fullName}" w arkuszu grupy ${groupNumber}, wiersz ${
            i + 2
          } (imię: "${imie}", nazwisko: "${nazwisko}")`
        );
        return { row: i + 2, found: true };
      }
    }

    console.log(
      `Nie znaleziono ucznia "${fullName}" w arkuszu grupy ${groupNumber}`
    );
    console.log(`Dostępni uczniowie w arkuszu:`);
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row && row.length >= 2) {
        const imie = row[0] ? row[0].trim() : ""; // Kolumna B
        const nazwisko = row[1] ? row[1].trim() : ""; // Kolumna C

        if (imie && nazwisko) {
          console.log(`- imię: "${imie}", nazwisko: "${nazwisko}"`);
        }
      }
    }

    return { row: -1, found: false };
  } catch (error) {
    console.error(
      `Błąd podczas szukania ucznia w arkuszu grupy ${groupNumber}:`,
      error
    );
    return { row: -1, found: false };
  }
}

/**
 * Znajduje kolumnę dla podanej daty
 * @param {string|number} groupNumber - Numer grupy
 * @param {string} targetDate - Data w formacie DD-MM-YYYY
 * @returns {Promise<{column: string, found: boolean}>} - Litera kolumny lub null jeśli nie znaleziono
 */
async function findDateColumn(groupNumber, targetDate) {
  try {
    if (!SPREADSHEET_ID) {
      console.error(
        "SPREADSHEET_ID nie jest ustawiony w zmiennych środowiskowych"
      );
      return { column: null, found: false };
    }

    const authClient = await authorize();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const sheetName = `Grupa${groupNumber}`;

    // Pobierz wiersz 21 (daty) od kolumny C do BF
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!C21:BF21`,
    });

    const dates = response.data.values ? response.data.values[0] || [] : [];

    // Szukaj dokładnego dopasowania daty (normalizuj format)
    for (let i = 0; i < dates.length; i++) {
      const dateInSheet =
        dates[i] && typeof dates[i] === "string" ? dates[i].trim() : "";

      if (dateInSheet) {
        // Normalizuj datę z arkusza do formatu DD-MM-YYYY
        const [day, month, year] = dateInSheet.split("-");
        if (day && month && year) {
          const normalizedSheetDate = `${day.padStart(2, "0")}-${month.padStart(
            2,
            "0"
          )}-${year}`;

          if (normalizedSheetDate === targetDate) {
            // Oblicz literę kolumny (C = 3, więc C + i)
            const columnIndex = 3 + i; // C jest 3-cią kolumną (A=1, B=2, C=3)
            const columnLetter = columnIndexToLetter(columnIndex);
            return { column: columnLetter, found: true };
          }
        }
      }
    }

    console.log(
      `Nie znaleziono daty "${targetDate}" w arkuszu grupy ${groupNumber}`
    );
    return { column: null, found: false };
  } catch (error) {
    console.error(
      `Błąd podczas szukania kolumny daty w arkuszu grupy ${groupNumber}:`,
      error
    );
    return { column: null, found: false };
  }
}

/**
 * Konwertuje indeks kolumny na literę
 * @param {number} columnIndex - Indeks kolumny (1-based, A=1, B=2, etc.)
 * @returns {string} - Litera kolumny (A, B, C, ..., AA, AB, etc.)
 */
function columnIndexToLetter(columnIndex) {
  let result = "";
  while (columnIndex > 0) {
    columnIndex--; // Zmień na 0-based
    result = String.fromCharCode(65 + (columnIndex % 26)) + result;
    columnIndex = Math.floor(columnIndex / 26);
  }
  return result;
}

/**
 * Zapisuje usprawiedliwienie ("u") w arkuszu dla danego ucznia i daty
 * @param {string|number} groupNumber - Numer grupy
 * @param {string} fullName - Pełne imię i nazwisko ucznia
 * Zapisuje usprawiedliwienie nieobecności w arkuszu Google Sheets.
 * Obsługuje dwa tryby wywołania:
 * 1. writeAbsenceToSheet(groupNumber, studentName, numerIndeksu, absenceDate) - nowy tryb z numerem indeksu
 * 2. writeAbsenceToSheet(groupNumber, fullName, absenceDate) - stary tryb dla kompatybilności wstecznej
 */
async function writeAbsenceToSheet(groupNumber, param2, param3, param4) {
  try {
    if (!SPREADSHEET_ID) {
      return {
        success: false,
        message: "SPREADSHEET_ID nie jest ustawiony w zmiennych środowiskowych",
      };
    }

    let studentResult, absenceDate;

    // Określ tryb wywołania na podstawie liczby parametrów
    if (param4) {
      // Nowy tryb: (groupNumber, studentName, numerIndeksu, absenceDate)
      const studentName = param2;
      const numerIndeksu = param3;
      absenceDate = param4;

      // Znajdź ucznia w arkuszu po imieniu i numerze indeksu
      studentResult = await findStudentInSheetByNameAndIndex(
        groupNumber,
        studentName,
        numerIndeksu
      );
    } else {
      // Stary tryb: (groupNumber, fullName, absenceDate)
      const fullName = param2;
      absenceDate = param3;

      // Znajdź ucznia w arkuszu po pełnym imieniu (stara metoda)
      studentResult = await findStudentInSheet(groupNumber, fullName);
    }

    if (!studentResult.found) {
      const searchInfo = param4
        ? `"${param2}" (indeks: ${param3})`
        : `"${param2}"`;
      return {
        success: false,
        message: `Nie znaleziono ucznia ${searchInfo} w arkuszu grupy ${groupNumber}`,
      };
    }

    // Znajdź kolumnę z datą
    const dateResult = await findDateColumn(groupNumber, absenceDate);
    if (!dateResult.found) {
      return {
        success: false,
        message: `Nie znaleziono daty "${absenceDate}" w arkuszu grupy ${groupNumber}`,
      };
    }

    // Zapisz "u" w odpowiedniej komórce
    const authClient = await authorize();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const sheetName = `Grupa${groupNumber}`;
    const cellAddress = `${dateResult.column}${studentResult.row}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!${cellAddress}`,
      valueInputOption: "RAW",
      resource: {
        values: [["u"]],
      },
    });

    console.log(
      `Zapisano usprawiedliwienie dla ${
        param4 ? `${param2} (indeks: ${param3})` : param2
      } na datę ${absenceDate} w komórce ${cellAddress} (Grupa ${groupNumber})`
    );

    return {
      success: true,
      message: `Usprawiedliwienie zapisane w arkuszu (komórka ${cellAddress})`,
    };
  } catch (error) {
    console.error(
      "Błąd podczas zapisywania usprawiedliwienia w arkuszu:",
      error
    );
    return {
      success: false,
      message: `Błąd podczas zapisywania w arkuszu: ${error.message}`,
    };
  }
}

module.exports = {
  findStudentInSheet,
  findDateColumn,
  writeAbsenceToSheet,
  columnIndexToLetter,
};
