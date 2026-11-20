import { Component, computed, inject, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { OpenMeteoService } from '../core/open-meteo.service';
import { Place, PlaceForecast, formatCoordinates } from '../core/models';
import { describeWeather } from '../core/weather-codes';

type ForecastState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: PlaceForecast };

/** «Μπαίνεις σε ένα μέρος»: τώρα, οι επόμενες 24 ώρες, οι επόμενες 7 μέρες. */
@Component({
  selector: 'app-place-detail',
  templateUrl: './place-detail.html',
  styleUrl: './place-detail.scss',
})
export class PlaceDetail {
  /** Για να ζητήσουμε την πλήρη πρόγνωση του μέρους. */
  private readonly weatherApi = inject(OpenMeteoService);

  /**
   * - place: Το μέρος που δείχνει το πάνελ (το δίνει το app.html).
   * - isSaved: Αν το μέρος είναι αποθηκευμένο (για το «★ Saved» / «☆ Save»).
   * - saveClicked: πατήθηκε το Save. Το ακούει το app.html και καλεί το store.
   * - closed: πατήθηκε το ✕ (κλείσιμο του πάνελ).
   */
  readonly place = input.required<Place>();
  readonly isSaved = input(false);
  readonly saveClicked = output<void>();
  readonly closed = output<void>();

  /** Ξαναφέρνει δεδομένα όποτε αλλάζει το `place`· το switchMap πετάει την απάντηση για μέρος που ήδη αφήσαμε. */
  readonly forecastState = toSignal(
    toObservable(this.place).pipe(
      switchMap((place) =>
        this.weatherApi.getPlaceForecast(place.lat, place.lon).pipe(
          map((data): ForecastState => ({ status: 'ready', data })),
          startWith<ForecastState>({ status: 'loading' }),
          catchError(() => of<ForecastState>({ status: 'error' })),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as ForecastState },
  );

  /** Η πρόγνωση, μόνο όταν έχει έρθει (αλλιώς null). Τη διαβάζει το template. */
  readonly loadedForecast = computed(() => {
    const state = this.forecastState();
    return state.status === 'ready' ? state.data : null;
  });

  /** Κείμενο και εικονίδιο για τον καιρό τώρα. */
  readonly currentWeather = computed(() => {
    const forecast = this.loadedForecast();
    return forecast ? describeWeather(forecast.current.weatherCode, forecast.current.isDay) : null;
  });

  /** Οι συντεταγμένες ως κείμενο, όταν το μέρος δεν έχει χώρα (κλικ στον χάρτη). */
  readonly coordinatesText = computed(() => formatCoordinates(this.place().lat, this.place().lon));

  /** Η διαδρομή SVG για τη γραμμή θερμοκρασίας 24 ωρών (viewBox 0..240 × 0..60). */
  readonly temperatureChart = computed(() => {
    const forecast = this.loadedForecast();
    if (!forecast || forecast.hourly.temperature.length < 2) return null;
    const temperatures = forecast.hourly.temperature;
    const min = Math.min(...temperatures);
    const max = Math.max(...temperatures);
    const span = Math.max(max - min, 1);
    // Από «ώρα» και «θερμοκρασία» σε θέση πάνω στο SVG (0..240 οριζόντια, 0..60 κάθετα, το 0 είναι πάνω).
    const xForHour = (hourIndex: number) => (hourIndex / (temperatures.length - 1)) * 240;
    const yForTemperature = (temperature: number) => 52 - ((temperature - min) / span) * 44;
    // "M" = ξεκίνα εδώ, "L" = γραμμή ως εδώ: μία εντολή για κάθε ώρα.
    const line = temperatures
      .map((temperature, hourIndex) => `${hourIndex ? 'L' : 'M'}${xForHour(hourIndex).toFixed(1)},${yForTemperature(temperature).toFixed(1)}`)
      .join(' ');
    const rain = forecast.hourly.precipitationProbability.map((probability, hourIndex) => ({
      x: xForHour(hourIndex) - 3,
      height: (probability / 100) * 56,
    }));
    const ticks = [0, 6, 12, 18, 23]
      .filter((hourIndex) => hourIndex < temperatures.length)
      .map((hourIndex) => ({
        x: Math.min(Math.max(xForHour(hourIndex), 10), 230),
        label: forecast.hourly.time[hourIndex].slice(11, 16),
      }));
    return { line, area: `${line} L240,60 L0,60 Z`, min: Math.round(min), max: Math.round(max), rain, ticks };
  });

  /** Όνομα της μέρας για τη λίστα 7 ημερών: "Today", "Fri", "Sat"… */
  dayName(isoDate: string, dayIndex: number): string {
    if (dayIndex === 0) return 'Today';
    // Μεσημέρι, ώστε η μέρα να μην αλλάζει από τη ζώνη ώρας του browser.
    return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
  }

  /** Εικονίδιο καιρού για μια μέρα της λίστας. */
  weatherIcon(code: number): string {
    return describeWeather(code).icon;
  }

  /** Περιγραφή καιρού (εμφανίζεται όταν περνάς το ποντίκι πάνω από το εικονίδιο). */
  weatherLabel(code: number): string {
    return describeWeather(code).label;
  }

  /** Η ώρα του τόπου, από την ώρα που δίνει το ίδιο το API (όχι από το ρολόι του χρήστη). */
  localTime(isoTime: string): string {
    return isoTime.slice(11, 16); // "2026-11-20T14:30" → "14:30"
  }

  /** Περιστροφή του βέλους ανέμου σε CSS. */
  windArrowRotation(degrees: number): string {
    return `rotate(${degrees + 180}deg)`; // το βέλος δείχνει προς τα πού πάει ο άνεμος
  }

  /** Στρογγύλεμα για την οθόνη (το template δεν βλέπει το Math). */
  roundNumber(value: number): number {
    return Math.round(value);
  }
}
