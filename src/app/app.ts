import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, switchMap, tap } from 'rxjs';
import { PlaceDetail } from './detail/place-detail';
import { MapBounds, sampleGridPoints } from './core/grid';
import { GeocodingResult, MapLayer, Place, PointTimeline, formatCoordinates, makePlaceId } from './core/models';
import { OpenMeteoService, TIMELINE_HOURS } from './core/open-meteo.service';
import { PlacesStore } from './core/places.store';
import { LAYER_LEGEND, LAYER_UNITS, colorForValue, formatValue } from './core/scales';
import { WorldMap } from './map/world-map';
import { MyPlaces } from './places/my-places';
import { SearchBox } from './search/search-box';

@Component({
  selector: 'app-root',
  imports: [WorldMap, SearchBox, PlaceDetail, MyPlaces],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
/** Το βασικό component («ο μαέστρος»): κρατά layer, ώρα και ▶, συνδέει χάρτη → πλέγμα → service → signals, και βρίσκει τη θέση του χρήστη. */
export class App {
  /**
   * - weatherApi: Το service που μιλάει με το Open-Meteo (το μόνο σημείο με HTTP).
   * - store: Τα αποθηκευμένα μέρη και το επιλεγμένο μέρος (κοινή κατάσταση). Public, γιατί το διαβάζει το app.html.
   */
  private readonly weatherApi = inject(OpenMeteoService);
  readonly store = inject(PlacesStore);

  /** Τα κουμπιά πάνω αριστερά στον χάρτη: ποια μεταβλητή ζωγραφίζεται. */
  readonly layerOptions: { id: MapLayer; label: string }[] = [
    { id: 'temperature', label: 'Temperature' },
    { id: 'precipitation', label: 'Rain' },
    { id: 'wind', label: 'Wind' },
  ];
  /**
   * - layer: Ποια μεταβλητή δείχνει τώρα ο χάρτης (θερμοκρασία, βροχή ή άνεμος).
   * - hour: Η ώρα του slider: 0 = τώρα, 24 = σε 24 ώρες. Την διαβάζουν ο χάρτης και οι κάρτες.
   * - isPlaying: Αν παίζει το ▶ (η ώρα προχωράει μόνη της).
   * - maxHour: Η τελευταία ώρα του slider (24).
   */
  readonly layer = signal<MapLayer>('temperature');
  readonly hour = signal(0);
  readonly isPlaying = signal(false);
  readonly maxHour = TIMELINE_HOURS - 1;

  /**
   * Κατάσταση (signals): όταν αλλάζουν, η οθόνη ενημερώνεται μόνη της.
   * - mapTimelines: Τι ζωγραφίζει ο χάρτης: κλειδί "lat,lon" → timeline.
   * - placeTimelines: Τα timelines των αποθηκευμένων μερών, με κλειδί το id του μέρους.
   */
  readonly mapTimelines = signal(new Map<string, PointTimeline>());
  readonly placeTimelines = signal(new Map<string, PointTimeline>());

  /**
   * - noticeMessage: Μήνυμα σφάλματος πάνω δεξιά στον χάρτη (π.χ. όριο 429). null = κανένα.
   * - isLocating: Αν ψάχνουμε τώρα τη θέση του χρήστη (το κουμπί γράφει «Finding you…»).
   * - requestCount: Πόσα αιτήματα στάλθηκαν: φαίνεται στο κάτω μέρος του πάνελ.
   */
  readonly noticeMessage = signal<string | null>(null);
  readonly isLocating = signal(false);
  readonly requestCount = this.weatherApi.requestsSent;

  /** Το υπόμνημα χρωμάτων κάτω από τα κουμπιά: τιμή, κείμενο και χρώμα για το τρέχον layer. */
  readonly legendStops = computed(() =>
    LAYER_LEGEND[this.layer()].map((value) => ({
      value,
      text: formatValue(this.layer(), value),
      color: colorForValue(this.layer(), value),
    })),
  );
  /** Η μονάδα του τρέχοντος layer (°C, mm/h ή km/h). */
  readonly layerUnit = computed(() => LAYER_UNITS[this.layer()]);

  /** Η ετικέτα του slider στο ρολόι του χρήστη: "Now", ή "Thu 18:00" + "+3 h". */
  readonly hourLabel = computed(() => {
    const hour = this.hour();
    if (hour === 0) return { when: 'Now', offset: '' };
    // Όλα τα σημεία έχουν τις ίδιες ώρες (GMT), οπότε φτάνει το πρώτο.
    const firstTimeline = this.mapTimelines().values().next().value as PointTimeline | undefined;
    const isoTime = firstTimeline?.time[hour];
    const when = isoTime
      ? new Date(isoTime + 'Z').toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    return { when, offset: `+${hour} h` };
  });

  /** Κάθε κίνηση του χάρτη μπαίνει εδώ· από κάτω περνά από debounce και switchMap (δες τον constructor). */
  private readonly mapMoves$ = new Subject<{ bounds: MapBounds; zoom: number }>();
  /** Το χρονόμετρο του ▶, για να το σταματάμε. */
  private playTimer?: ReturnType<typeof setInterval>;

  /** Στήνει τις δύο ροές δεδομένων: (1) κίνηση χάρτη → αίτημα για τα σημεία, (2) αλλαγή αποθηκευμένων → αίτημα για τις κάρτες. */
  constructor() {
    const destroyRef = inject(DestroyRef);

    // Ο χάρτης κινήθηκε → περίμενε να σταματήσει → βγάλε σημεία πλέγματος → ένα αίτημα για όσα δεν είναι στην cache.
    this.mapMoves$
      .pipe(
        debounceTime(450),
        switchMap(({ bounds, zoom }) => {
          const points = sampleGridPoints(bounds, zoom, MAX_POINTS_PER_VIEW);
          return this.weatherApi.getMapTimelines(points).pipe(
            catchError((error) => {
              this.showNotice(errorMessageFor(error));
              return EMPTY;
            }),
            tap((timelines) => this.mapTimelines.set(timelines)),
          );
        }),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe();

    // Άλλαξαν τα αποθηκευμένα μέρη → φέρε (ή πάρε από την cache) τα timelines όλων μαζί, σε ένα αίτημα.
    effect((onCleanup) => {
      const places = this.store.savedPlaces();
      if (!places.length) {
        this.placeTimelines.set(new Map());
        return;
      }
      const subscription = this.weatherApi
        .getMapTimelines(places.map((place) => ({ lat: roundToTwoDecimals(place.lat), lon: roundToTwoDecimals(place.lon), key: place.id })))
        .subscribe({
          next: (timelines) => this.placeTimelines.set(timelines),
          error: (error) => this.showNotice(errorMessageFor(error)),
        });
      // Αν αλλάξει πάλι η λίστα πριν έρθει η απάντηση, το παλιό αίτημα ακυρώνεται.
      onCleanup(() => subscription.unsubscribe());
    });

    this.autoLocateIfAllowed();
    destroyRef.onDestroy(() => this.stop());
  }

  /** Καλείται από τον χάρτη (viewChanged) σε κάθε κίνηση: απλώς τη στέλνει στη ροή mapMoves$. */
  onMapMoved(view: { bounds: MapBounds; zoom: number }): void {
    this.mapMoves$.next(view);
  }

  /** Κλικ στον χάρτη ή σε κουτάκι: ανοίγει το πάνελ για αυτό το σημείο. */
  onMapClicked(point: { lat: number; lon: number }): void {
    const id = makePlaceId(point.lat, point.lon);
    // Αν το σημείο είναι ήδη αποθηκευμένο, ανοίγει με το όνομά του.
    const saved = this.store.savedPlaces().find((place) => place.id === id);
    this.store.select(saved ?? { id, name: formatCoordinates(point.lat, point.lon), lat: point.lat, lon: point.lon });
  }

  /** Ο χρήστης διάλεξε πόλη από την αναζήτηση: γίνεται το επιλεγμένο μέρος και ο χάρτης πετάει εκεί. */
  onPlaceFound(foundPlace: GeocodingResult): void {
    this.store.select({
      id: makePlaceId(foundPlace.latitude, foundPlace.longitude),
      name: foundPlace.name,
      country: foundPlace.country,
      region: foundPlace.admin1,
      lat: foundPlace.latitude,
      lon: foundPlace.longitude,
    });
  }

  /** Το κουμπί «My location»: ζητά τη θέση από τον browser. Αν αρνηθεί ο χρήστης, μήνυμα με το τι να κάνει. */
  locate(): void {
    if (!('geolocation' in navigator)) {
      this.showNotice('Your browser cannot share your location. Search for your town instead.');
      return;
    }
    this.isLocating.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.isLocating.set(false);
        const { latitude: lat, longitude: lon } = position.coords;
        // Χωρίς region/country: το πάνελ δείχνει τότε τις συντεταγμένες μία φορά.
        const myLocation: Place = { id: makePlaceId(lat, lon), name: 'My location', lat, lon };
        this.store.myLocation.set(myLocation);
        this.store.select(myLocation);
      },
      (error) => {
        this.isLocating.set(false);
        this.showNotice(
          error.code === error.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in the browser address bar, or search for your town.'
            : "Couldn't find your location. Search for your town instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  /** Το κουμπί ▶ / ❚❚: προχωρά την ώρα κάθε 600ms ως τις 24 ώρες. Δεν κάνει κανένα αίτημα: τα δεδομένα υπάρχουν ήδη. */
  togglePlay(): void {
    if (this.isPlaying()) return this.stop();
    if (this.hour() >= this.maxHour) this.hour.set(0);
    this.isPlaying.set(true);
    this.playTimer = setInterval(() => {
      if (this.hour() >= this.maxHour) return this.stop();
      this.hour.update((hour) => hour + 1);
    }, 600);
  }

  /** Ο χρήστης έσυρε τον slider: σταματά το ▶ και βάζει αυτή την ώρα. */
  setHour(hour: number): void {
    this.stop();
    this.hour.set(hour);
  }

  /** Σταματά το ▶. */
  private stop(): void {
    this.isPlaying.set(false);
    clearInterval(this.playTimer);
  }

  /** Δείχνει μήνυμα πάνω δεξιά για 6 δευτερόλεπτα. */
  private showNotice(message: string): void {
    this.noticeMessage.set(message);
    // Σβήνει μόνο του μετά από 6 δευτερόλεπτα, αν δεν έχει έρθει άλλο μήνυμα στο μεταξύ.
    setTimeout(() => this.noticeMessage() === message && this.noticeMessage.set(null), 6000);
  }

  /** Βρίσκει τη θέση στο φόρτωμα μόνο αν ο χρήστης έχει ήδη δώσει άδεια: χωρίς ξαφνικό παράθυρο άδειας. */
  private autoLocateIfAllowed(): void {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permission) => permission.state === 'granted' && this.locate())
      .catch(() => undefined);
  }
}

/** Μέγιστος αριθμός τοποθεσιών ανά οθόνη χάρτη (το Open-Meteo μετράει κάθε τοποθεσία). */
const MAX_POINTS_PER_VIEW = 60;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100; // 2 δεκαδικά
}

function errorMessageFor(error: unknown): string {
  const status = (error as { status?: number })?.status;
  return status === 429
    ? 'The free weather service is busy (request limit). Showing what is already loaded; try again in a minute.'
    : "Couldn't load weather for this area. Check your connection and move the map to retry.";
}
