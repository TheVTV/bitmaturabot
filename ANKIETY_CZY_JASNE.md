# Dokumentacja komendy "Czy jasne?"

## Opis systemu

System ankiet "Czy jasne?" pozwala nauczycielom na sprawdzenie zrozumienia omawianych tematów przez uczniów w czasie rzeczywistym. Uczniowie mogą anonimowo wskazać czy dany temat jest dla nich jasny, a w przypadku problemów - opisać co sprawia im trudność.

**Ważne:** Każdy uczeń może zagłosować tylko raz. Nauczyciele nie mogą głosować w ankietach.

## Komenda

### `/czy-jasne`

**Dostęp:** Tylko nauczyciele  
**Opis:** Tworzy interaktywną ankietę sprawdzającą zrozumienie tematu

**Parametry:**

- `temat` (wymagany) - Temat lub zagadnienie do sprawdzenia

**Funkcjonalność:**

- Tworzy embed z dwoma przyciskami: "✅ Jasne" i "❓ Niejasne"
- **Tylko uczniowie mogą głosować** - nauczyciele są automatycznie blokowane
- **Jeden głos na osobę** - brak możliwości zmiany zdania
- Kliknięcie "Jasne" - aktualizuje licznik
- Kliknięcie "Niejasne" - pokazuje formularz do opisania problemu
- Odpowiedzi są całkowicie anonimowe
- Embed jest aktualizowany na bieżąco
- **Ankieta działa do momentu restartu bota**

## Przepływ pracy

1. **Nauczyciel tworzy ankietę** - `/czy-jasne temat:"Równania kwadratowe"`
2. **Uczniowie głosują** - Klikają odpowiednie przyciski (tylko raz!)
3. **Problemy są zgłaszane anonimowo** - Formularz dla "niejasne"
4. **Nauczyciel monitoruje na bieżąco** - Embed aktualizuje się automatycznie
5. **Ankieta działa ciągle** - Dopóki bot nie zostanie zrestartowany

## Ograniczenia i zasady

### ✅ **Co można:**

- Uczniowie mogą głosować w ankietach
- Każdy uczeń może zagłosować **tylko raz**
- Anonimowe opisywanie problemów przy "niejasne"
- Nauczyciele mogą tworzyć nowe ankiety

### ❌ **Czego nie można:**

- **Nauczyciele nie mogą głosować** w ankietach
- **Brak możliwości zmiany głosu** - jeden głos na osobę
- Brak możliwości usuwania ankiet
- Brak możliwości resetowania głosów

### 🔒 **Komunikaty błędów:**

- _"Nauczyciele nie mogą głosować w ankietach"_
- _"Już zagłosowałeś w tej ankiecie. Jeden głos na osobę."_
- _"Tylko uczniowie mogą głosować w tej ankiecie"_

## Ograniczenia techniczne

- Ankiety są przechowywane w pamięci bota (restart = utrata danych)
- Maksymalnie 500 znaków w opisie problemu
- Brak limitu liczby aktywnych ankiet jednocześnie
- **Nie ma możliwości kończenia ankiet** - działają do restartu bota
- **Nie ma możliwości resetowania głosów**

## Bezpieczeństwo i prywatność

- Wszystkie odpowiedzi "niejasne" są całkowicie anonimowe
- Bot śledzi tylko czy użytkownik już głosował (nie przechowuje co wybrał)
- Nauczyciele widzą tylko łączne statystyki
- Niemożliwe jest określenie kto napisał który komentarz

## Przykłady użycia

```
/czy-jasne temat:"Wzór na deltę w równaniach kwadratowych"
/czy-jasne temat:"Analiza składniowa zdania złożonego"
/czy-jasne temat:"Prawo zachowania energii"
```

## Przewodnik dla uczniów

1. **Głosowanie**: Kliknij "✅ Jasne" lub "❓ Niejasne"
2. **Jedna szansa**: Nie można zmienić zdania po zagłosowaniu
3. **Formularz**: Jeśli wybierzesz "niejasne", opisz swój problem
4. **Anonimowość**: Nikt nie wie kto co napisał

## Przewodnik dla nauczycieli

1. **Tworzenie**: Użyj `/czy-jasne temat:"Twój temat"`
2. **Monitorowanie**: Obserwuj embed - aktualizuje się automatycznie
3. **Nie głosuj**: Nauczyciele są automatycznie blokani od głosowania
4. **Brak zarządzania**: Ankiety działają same do restartu bota
