# 🤖 BitMaturaBot - Discord Registration Bot

Zaawansowany bot Discord do automatycznej rejestracji studentów z systemem szyfrowania danych osobowych.

## 📋 Funkcjonalności

- **🔐 Bezpieczna rejestracja** - Szyfrowanie danych AES-256-CBC
- **📧 Walidacja email** - Sprawdzanie czy email jest na liście studentów
- **🎭 Automatyczne role** - Przypisywanie ról na podstawie grupy
- **💬 Prywatne wątki** - Rejestracja w bezpiecznych thread'ach
- **⚙️ Konfiguracja serwera** - Elastyczne ustawienie ról przez właściciela
- **📊 MySQL Database** - Wydajna baza danych z szyfrowaniem
- **🤖 Automatyczne odpowiedzi** - Bot reaguje na popularne frazy
- **🏆 System punktowy** - Nagradzanie użytkowników punktami z rankingiem

## 🚀 Instalacja

1. **Sklonuj repozytorium**

   ```bash
   git clone <repository-url>
   cd bitmaturabot
   ```

2. **Zainstaluj zależności**

   ```bash
   npm install
   ```

3. **Konfiguracja środowiska**

   ```bash
   cp .env.example .env
   # Edytuj .env z własnymi danymi
   ```

4. **Wdróż komendy Discord**

   ```bash
   npm run deploy
   ```

5. **Uruchom bota**
   ```bash
   npm start
   ```

## ⚙️ Konfiguracja

### Zmienne środowiskowe (.env)

```env
# Discord Bot
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id

# Baza danych MySQL
DATABASE_URL=mysql://username:password@host:port/database

# Szyfrowanie (generowane automatycznie)
ENCRYPTION_KEY=your_32_character_hex_key
SEARCH_SALT=your_unique_salt_for_search
```

### Uprawnienia bota

Bot potrzebuje następujących uprawnień:

- `Send Messages`
- `Create Public Threads`
- `Create Private Threads`
- `Manage Roles`
- `Use Slash Commands`

## 📖 Komendy

- `/ping` - Test połączenia z botem
- `/rejestruj` - Rozpoczęcie procesu rejestracji
- `/konfiguracja` - Ustawienie ról serwera (wymaga roli administratora z konfiguracji)
- `/zmień-grupę` - Zmiana grupy użytkownika (wymaga roli administratora z konfiguracji)
- `/grupa` - Wyświetlenie listy uczniów z wybranej grupy (dla nauczycieli i administratorów)
- `/dodaj-uczniów` - Import uczniów z pliku (wymaga roli administratora z konfiguracji)
- `/punkty` - Sprawdzenie punktów użytkownika (dla uczniów, nauczycieli i administratorów)
- `/ranking` - Wyświetlenie rankingu punktów top 10 (dla uczniów, nauczycieli i administratorów)

## 🤖 Automatyczne odpowiedzi

Bot automatycznie reaguje na określone frazy:

- **"kto pytał"** (i warianty) → "Siema, ja pytałem"

## 🔐 Bezpieczeństwo

- **AES-256-CBC** - Szyfrowanie danych osobowych
- **Hash wyszukiwania** - Wydajne wyszukiwanie bez deszyfrowania
- **Prywatne wątki** - Ochrona danych podczas rejestracji
- **Walidacja danych** - Sprawdzanie poprawności email i danych

## 📂 Struktura projektu

```
src/
├── commands/           # Komendy slash Discord
├── crypto/            # Moduł szyfrowania
├── db/                # Baza danych MySQL
├── events/            # Event handlery Discord
├── scripts/           # Narzędzia pomocnicze
├── state/             # Zarządzanie stanem
└── index.js           # Główny plik aplikacji
```

## 🛠️ Rozwój

```bash
# Tryb deweloperski (auto-restart)
npm run dev

# Wdrożenie komend na serwer testowy
npm run deploy:guild

# Sprawdzenie zdrowia systemu
npm run health-check
```

## 📝 Licencja

Ten projekt jest prywatny i przeznaczony do użytku wewnętrznego.
