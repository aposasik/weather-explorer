import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { OpenMeteoService } from '../core/open-meteo.service';
import { GeocodingResult } from '../core/models';

/**
 * Αναζήτηση μέρους με το Geocoding API του Open-Meteo.
 * debounceTime(350): περιμένει να σταματήσει η πληκτρολόγηση → ένα αίτημα αντί για ένα ανά πλήκτρο.
 * switchMap: αν ο χρήστης ξαναγράψει, το παλιό αίτημα ακυρώνεται και αγνοείται.
 */
@Component({
  selector: 'app-search-box',
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
})
export class SearchBox {
  /** Για την αναζήτηση στο Geocoding API. */
  private readonly weatherApi = inject(OpenMeteoService);

  /** Γεγονός: ο χρήστης διάλεξε πόλη. */
  readonly placePicked = output<GeocodingResult>();

  /**
   * Κατάσταση (signals): όταν αλλάζουν, η οθόνη ενημερώνεται μόνη της.
   * - typedText: Το κείμενο που γράφει ο χρήστης.
   * - foundPlaces: Τα αποτελέσματα που φαίνονται στη λίστα.
   * - isLoading: Αν περιμένουμε απάντηση (γυρίζει το spinner).
   * - errorMessage: Μήνυμα αν απέτυχε η αναζήτηση.
   * - activeIndex: Ποιο αποτέλεσμα είναι επιλεγμένο με τα βελάκια (-1 = κανένα).
   * - isListOpen: Αν φαίνεται η λίστα αποτελεσμάτων.
   */
  readonly typedText = signal('');
  readonly foundPlaces = signal<GeocodingResult[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly activeIndex = signal(-1);
  readonly isListOpen = signal(false);

  /** Κάθε πλήκτρο μπαίνει εδώ· από κάτω debounce 350ms και switchMap (δες τον constructor). */
  private readonly searchTexts$ = new Subject<string>();

  /** Η ροή της αναζήτησης: περίμενε να σταματήσει το γράψιμο → ίδιο κείμενο; μην ξαναρωτάς → ζήτα (το παλιό αίτημα ακυρώνεται) → δείξε αποτελέσματα. */
  constructor() {
    this.searchTexts$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        tap(() => {
          this.isLoading.set(true);
          this.errorMessage.set(null);
        }),
        switchMap((searchText) =>
          this.weatherApi.searchPlaces(searchText).pipe(
            catchError(() => {
              this.errorMessage.set('Search is unavailable right now. Try again in a moment.');
              return of([] as GeocodingResult[]);
            }),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((places) => {
        this.isLoading.set(false);
        this.foundPlaces.set(places);
        this.activeIndex.set(places.length ? 0 : -1); // το πρώτο αποτέλεσμα επιλεγμένο, για το Enter
        // Η λίστα ανοίγει μόνο για 3+ γράμματα· αλλιώς θα έγραφε «No places found» ενώ ο χρήστης ακόμα γράφει.
        this.isListOpen.set(this.typedText().trim().length >= 3);
      });
  }

  /** Καλείται σε κάθε πλήκτρο: κρατά το κείμενο και το στέλνει στη ροή. */
  onInput(value: string): void {
    this.typedText.set(value);
    if (value.trim().length < 3) {
      this.foundPlaces.set([]);
      this.isListOpen.set(false);
    }
    this.searchTexts$.next(value);
  }

  /** Πληκτρολόγιο στη λίστα: ↑ ↓ αλλάζουν επιλογή, Enter διαλέγει, Esc κλείνει. */
  onKey(event: KeyboardEvent): void {
    const resultCount = this.foundPlaces().length;
    // Το % κάνει «κύκλο»: από το τελευταίο, το ↓ πάει στο πρώτο.
    if (event.key === 'ArrowDown' && resultCount) {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() + 1) % resultCount);
    } else if (event.key === 'ArrowUp' && resultCount) {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() - 1 + resultCount) % resultCount);
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      event.preventDefault();
      this.choose(this.foundPlaces()[this.activeIndex()]);
    } else if (event.key === 'Escape') {
      this.isListOpen.set(false);
    }
  }

  /** Διάλεξε πόλη: στέλνει το γεγονός και καθαρίζει το πεδίο. */
  choose(place: GeocodingResult): void {
    this.placePicked.emit(place);
    this.typedText.set('');
    this.foundPlaces.set([]);
    this.isListOpen.set(false);
  }

  /** Σημαία από τον κωδικό χώρας: κάθε γράμμα (A–Z) γίνεται το αντίστοιχο «γράμμα σημαίας» του Unicode. */
  flag(countryCode?: string): string {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    return String.fromCodePoint(
      ...[...countryCode.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
    );
  }
}
