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
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const auth = new google.auth.GoogleAuth({ credentials, scopes });
  return await auth.getClient();
}

/**
 * Pobiera daty z wiersza 21 arkusza dla danej grupy
 * @param {string|number} groupNumber - Numer grupy
 * @returns {Promise<string[]>} - Array dat w formacie DD-MM-YYYY
 */
async function getGroupDates(groupNumber) {
  try {
    if (!SPREADSHEET_ID) {
      console.error("SPREADSHEET_ID nie jest ustawiony w zmiennych środowiskowych");
      return [];
    }

    const authClient = await authorize();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const sheetName = `Grupa${groupNumber}`;
    
    // Pobierz wiersz 21 od kolumny C (gdzie zaczynają się daty zajęć)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!C21:BF21`, // Wiersz 21, kolumny C do BF
    });

    const dates = response.data.values ? response.data.values[0] || [] : [];
    
    // Filtruj i normalizuj daty - obsługuj zarówno format D-M-YYYY jak i DD-MM-YYYY
    const validDates = dates.filter(date => {
      if (!date || typeof date !== 'string') return false;
      // Sprawdź czy data pasuje do formatu D-M-YYYY lub DD-MM-YYYY
      return /^\d{1,2}-\d{1,2}-\d{4}$/.test(date.trim());
    }).map(date => {
      // Normalizuj do formatu DD-MM-YYYY
      const trimmedDate = date.trim();
      const [day, month, year] = trimmedDate.split('-');
      const normalizedDate = `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
      return normalizedDate;
    });

    return validDates;
  } catch (error) {
    console.error(`Błąd podczas pobierania dat dla grupy ${groupNumber}:`, error);
    return [];
  }
}

/**
 * Waliduje czy podana data jest w prawidłowym formacie i czy istnieje w arkuszu
 * @param {string} inputDate - Data wprowadzona przez użytkownika (DD-MM-YYYY)
 * @param {number} groupNumber - Numer grupy
 * @returns {Promise<{isValid: boolean, isInFuture: boolean, hasClasses: boolean, nearestDates: string[]}>}
 */
async function validateAbsenceDate(inputDate, groupNumber) {
  // Sprawdź format daty
  if (!inputDate || !/^\d{2}-\d{2}-\d{4}$/.test(inputDate.trim())) {
    return {
      isValid: false,
      isInFuture: false,
      hasClasses: false,
      nearestDates: [],
      error: "Nieprawidłowy format daty. Użyj formatu DD-MM-YYYY (np. 19-09-2025)"
    };
  }

  const cleanDate = inputDate.trim();
  
  // Sprawdź czy data jest w przyszłości lub dzisiaj
  const [day, month, year] = cleanDate.split('-').map(Number);
  const inputDateObj = new Date(year, month - 1, day); // month-1 bo Date używa 0-indexowanych miesięcy
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Ustaw na początek dnia
  
  const isInFuture = inputDateObj >= today;

  // Pobierz daty z arkusza dla grupy
  const groupDates = await getGroupDates(groupNumber);
  
  // Jeśli nie udało się pobrać dat z arkusza, zwróć informację o błędzie
  if (groupDates.length === 0) {
    return {
      isValid: true,
      isInFuture,
      hasClasses: false,
      nearestDates: [],
      inputDate: cleanDate,
      error: `Nie udało się pobrać harmonogramu zajęć dla grupy ${groupNumber}. Skontaktuj się z prowadzącym.`
    };
  }

  const hasClasses = groupDates.includes(cleanDate);

  // Znajdź 5 najbliższych dat od dzisiaj
  const nearestDates = findNearestDates(groupDates, 5);

  return {
    isValid: true,
    isInFuture,
    hasClasses,
    nearestDates,
    inputDate: cleanDate
  };
}

/**
 * Waliduje datę z trzech oddzielnych pól (dzień, miesiąc, rok)
 * @param {string} day - Dzień (1-31)
 * @param {string} month - Miesiąc (1-12)
 * @param {string} year - Rok (YYYY)
 * @param {number} groupNumber - Numer grupy
 * @returns {Promise<{isValid: boolean, isInFuture: boolean, hasClasses: boolean, nearestDates: string[]}>}
 */
async function validateAbsenceDateFromFields(day, month, year, groupNumber) {
  // Sprawdź czy wszystkie pola są wypełnione
  if (!day || !month || !year) {
    return {
      isValid: false,
      isInFuture: false,
      hasClasses: false,
      nearestDates: [],
      error: "Wszystkie pola daty są obowiązkowe (dzień, miesiąc, rok)"
    };
  }

  // Sprawdź czy są to liczby
  const dayNum = parseInt(day.trim());
  const monthNum = parseInt(month.trim());
  const yearNum = parseInt(year.trim());

  if (isNaN(dayNum) || isNaN(monthNum) || isNaN(yearNum)) {
    return {
      isValid: false,
      isInFuture: false,
      hasClasses: false,
      nearestDates: [],
      error: "Dzień, miesiąc i rok muszą być liczbami"
    };
  }

  // Sprawdź zakresy
  if (dayNum < 1 || dayNum > 31) {
    return {
      isValid: false,
      isInFuture: false,
      hasClasses: false,
      nearestDates: [],
      error: "Dzień musi być z zakresu 1-31"
    };
  }

  if (monthNum < 1 || monthNum > 12) {
    return {
      isValid: false,
      isInFuture: false,
      hasClasses: false,
      nearestDates: [],
      error: "Miesiąc musi być z zakresu 1-12"
    };
  }

  if (yearNum < 2020 || yearNum > 2030) {
    return {
      isValid: false,
      isInFuture: false,
      hasClasses: false,
      nearestDates: [],
      error: "Rok musi być z zakresu 2020-2030"
    };
  }

  // Sprawdź czy data jest prawidłowa (czy istnieje)
  const dateObj = new Date(yearNum, monthNum - 1, dayNum);
  if (dateObj.getFullYear() !== yearNum || dateObj.getMonth() !== monthNum - 1 || dateObj.getDate() !== dayNum) {
    return {
      isValid: false,
      isInFuture: false,
      hasClasses: false,
      nearestDates: [],
      error: "Podana data nie istnieje w kalendarzu"
    };
  }

  // Stwórz sformatowaną datę DD-MM-YYYY
  const formattedDate = `${dayNum.toString().padStart(2, '0')}-${monthNum.toString().padStart(2, '0')}-${yearNum}`;

  // Sprawdź czy data jest w przyszłości lub dzisiaj
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isInFuture = dateObj >= today;

  // Pobierz daty z arkusza dla grupy
  const groupDates = await getGroupDates(groupNumber);
  
  // Jeśli nie udało się pobrać dat z arkusza, zwróć informację o błędzie
  if (groupDates.length === 0) {
    return {
      isValid: true,
      isInFuture,
      hasClasses: false,
      nearestDates: [],
      inputDate: formattedDate,
      error: `Nie udało się pobrać harmonogramu zajęć dla grupy ${groupNumber}. Skontaktuj się z prowadzącym.`
    };
  }

  const hasClasses = groupDates.includes(formattedDate);

  // Znajdź 5 najbliższych dat od dzisiaj
  const nearestDates = findNearestDates(groupDates, 5);

  return {
    isValid: true,
    isInFuture,
    hasClasses,
    nearestDates,
    inputDate: formattedDate
  };
}

/**
 * Znajduje najbliższe daty od dzisiaj
 * @param {string[]} dates - Array dat w formacie DD-MM-YYYY
 * @param {number} limit - Maksymalna liczba dat do zwrócenia
 * @returns {string[]} - Posortowane daty od najbliższej
 */
function findNearestDates(dates, limit = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureDates = dates
    .map(dateStr => {
      const [day, month, year] = dateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      return {
        dateStr,
        dateObj,
        diff: dateObj - today
      };
    })
    .filter(item => item.diff >= 0) // Tylko daty z dzisiaj i przyszłości
    .sort((a, b) => a.diff - b.diff) // Sortuj od najbliższej
    .slice(0, limit)
    .map(item => item.dateStr);

  return futureDates;
}

/**
 * Formatuje datę z obiektu Date do formatu DD-MM-YYYY
 * @param {Date} date - Obiekt daty
 * @returns {string} - Data w formacie DD-MM-YYYY
 */
function formatDateToDDMMYYYY(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

module.exports = {
  getGroupDates,
  validateAbsenceDate,
  validateAbsenceDateFromFields,
  findNearestDates,
  formatDateToDDMMYYYY
};