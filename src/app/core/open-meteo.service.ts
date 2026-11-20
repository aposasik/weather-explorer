import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, map, tap } from 'rxjs';
import { GeocodingResult, PlaceForecast, PointTimeline } from './models';
import { ExpiringCache } from './expiring-cache';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** Ώρες του timeline του χάρτη (τώρα … +24 ώρες). */
export const TIMELINE_HOURS = 25;

const getLocalStorageSafely = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/**
 * Το μόνο σημείο που μιλάει με το Open-Meteo.
 *
 * Όριο αιτημάτων (δωρεάν: 600/λεπτό, 5.000/ώρα, 10.000/μέρα, μετράει κάθε τοποθεσία):
 * 1. Τα σημεία του χάρτη έρχονται με ΕΝΑ αίτημα ανά οθόνη (συντεταγμένες με κόμμα),
 *    και μόνο όσα δεν είναι ήδη στην cache.
 * 2. Κάθε απάντηση μένει στην cache 15 λεπτά (χάρτης, πάνελ) ή 24 ώρες (αναζήτηση), και στο localStorage.
 */
@Injectable({ providedIn: 'root' })
export class OpenMeteoService {
  /** Το HttpClient του Angular: στέλνει τα GET. */
  private readonly http = inject(HttpClient);

  /** Cache για τα σημεία του χάρτη: 15 λεπτά, και στο localStorage (άρα το reload δεν κοστίζει). */
  private readonly mapPointCache = new ExpiringCache<PointTimeline>(15 * 60_000, getLocalStorageSafely(), 'wx:pt:');
  // 'wx:fc2:': νέα «έκδοση» της cache, γιατί οι παλιές αποθηκευμένες προγνώσεις δεν έχουν ανατολή/δύση.
  private readonly forecastCache = new ExpiringCache<PlaceForecast>(15 * 60_000, getLocalStorageSafely(), 'wx:fc2:');
  /** Cache για τις αναζητήσεις πόλεων: 24 ώρες, οι πόλεις δεν αλλάζουν. */
  private readonly searchCache = new ExpiringCache<GeocodingResult[]>(24 * 60 * 60_000, getLocalStorageSafely(), 'wx:geo:');

  /** Πόσα HTTP αιτήματα στάλθηκαν πραγματικά (φαίνεται στην οθόνη, χρήσιμο στην παρουσίαση). */
  readonly requestsSent = signal(0);

  /**
   * Ωριαία timelines για πολλά σημεία. Όσα είναι στην cache επιστρέφονται αμέσως·
   * τα υπόλοιπα έρχονται όλα μαζί με ένα αίτημα.
   */
  getMapTimelines(points: { lat: number; lon: number; key: string }[]): Observable<Map<string, PointTimeline>> {
    const timelinesByKey = new Map<string, PointTimeline>();
    const uncachedPoints: typeof points = [];
    for (const point of points) {
      const cached = this.mapPointCache.get(point.key);
      if (cached && cached.time.length >= TIMELINE_HOURS && isCurrentHour(cached.time[0])) timelinesByKey.set(point.key, cached);
      else uncachedPoints.push(point);
    }
    if (uncachedPoints.length === 0) return of(timelinesByKey);

    const params = new HttpParams()
      .set('latitude', uncachedPoints.map((point) => point.lat).join(','))
      .set('longitude', uncachedPoints.map((point) => point.lon).join(','))
      .set('hourly', 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day')
      .set('forecast_hours', TIMELINE_HOURS)
      .set('timezone', 'GMT'); // ίδιο ρολόι για όλα τα σημεία, ώστε ο slider να δείχνει την ίδια στιγμή παντού

    return this.sendRequest<OpenMeteoResponse | OpenMeteoResponse[]>(FORECAST_URL, params).pipe(
      // Ένα σημείο → ένα αντικείμενο· πολλά σημεία → πίνακας. Το κάνουμε πάντα πίνακα.
      map((response) => (Array.isArray(response) ? response : [response])),
      map((forecasts) => {
        // Η απάντηση είναι στην ίδια σειρά με τα σημεία που ζητήσαμε.
        forecasts.forEach((forecast, index) => {
          const point = uncachedPoints[index];
          const hourly = forecast.hourly!;
          const timeline: PointTimeline = {
            lat: point.lat,
            lon: point.lon,
            time: hourly['time'] as string[],
            temperature: hourly['temperature_2m'] as number[],
            precipitation: hourly['precipitation'] as number[],
            weatherCode: hourly['weather_code'] as number[],
            windSpeed: hourly['wind_speed_10m'] as number[],
            windDirection: hourly['wind_direction_10m'] as number[],
            isDay: hourly['is_day'] as number[],
          };
          this.mapPointCache.set(point.key, timeline);
          timelinesByKey.set(point.key, timeline);
        });
        return timelinesByKey;
      }),
    );
  }

  /** Πλήρης πρόγνωση για ένα μέρος: τώρα, επόμενες 24 ώρες, επόμενες 7 μέρες. */
  getPlaceForecast(lat: number, lon: number): Observable<PlaceForecast> {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = this.forecastCache.get(key);
    if (cached) return of(cached);

    const params = new HttpParams()
      .set('latitude', lat.toFixed(4))
      .set('longitude', lon.toFixed(4))
      .set(
        'current',
        'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day',
      )
      .set('hourly', 'temperature_2m,precipitation_probability')
      .set('forecast_hours', 24)
      .set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset')
      .set('forecast_days', 7)
      .set('timezone', 'auto'); // η ώρα του τόπου, όχι του χρήστη

    return this.sendRequest<OpenMeteoResponse>(FORECAST_URL, params).pipe(
      map((response) => toPlaceForecast(response)),
      tap((forecast) => this.forecastCache.set(key, forecast)),
    );
  }

  /** Αναζήτηση μέρους. Το debounce το κάνει όποιος καλεί· τα αποτελέσματα μένουν στην cache μία μέρα. */
  searchPlaces(query: string): Observable<GeocodingResult[]> {
    const text = query.trim().toLowerCase();
    // Με 2 γράμματα το Open-Meteo δεν φέρνει τίποτα (ψάχνει από 3 και πάνω), άρα δεν στέλνουμε αίτημα.
    if (text.length < 3) return of([]);
    const cached = this.searchCache.get(text);
    if (cached) return of(cached);
    const params = new HttpParams().set('name', text).set('count', 6).set('language', 'en').set('format', 'json');
    return this.sendRequest<{ results?: GeocodingResult[] }>(GEOCODING_URL, params).pipe(
      map((response) => response.results ?? []),
      tap((places) => this.searchCache.set(text, places)),
    );
  }

  /** Κάθε αίτημα περνά από εδώ, για να μετράμε πόσα στάλθηκαν. */
  private sendRequest<T>(url: string, params: HttpParams): Observable<T> {
    this.requestsSent.update((count) => count + 1);
    return this.http.get<T>(url, { params });
  }
}

/** Το σχήμα της απάντησης του Open-Meteo, όπως έρχεται (πριν το μετατρέψουμε στους δικούς μας τύπους). */
interface OpenMeteoResponse {
  timezone: string;
  current?: Record<string, number | string>;
  hourly?: Record<string, (number | string)[]>;
  daily?: Record<string, (number | string)[]>;
}

/** Είναι αυτή η ώρα ISO (UTC, "2026-11-19T13:00") η τρέχουσα; Παλιότερα timelines θεωρούνται ληγμένα. */
function isCurrentHour(isoUtc: string): boolean {
  const start = Date.parse(isoUtc + 'Z');
  const now = Date.now();
  return now >= start && now - start < 60 * 60_000;
}

/** Μετατρέπει την απάντηση του API (ονόματα όπως temperature_2m) στους δικούς μας τύπους (temperature). Το τεστ το ελέγχει. */
export function toPlaceForecast(response: OpenMeteoResponse): PlaceForecast {
  const current = response.current ?? {};
  const hourly = response.hourly ?? {};
  const daily = response.daily ?? {};
  return {
    timezone: response.timezone,
    current: {
      time: String(current['time']),
      temperature: Number(current['temperature_2m']),
      feelsLike: Number(current['apparent_temperature']),
      humidity: Number(current['relative_humidity_2m']),
      precipitation: Number(current['precipitation']),
      weatherCode: Number(current['weather_code']),
      windSpeed: Number(current['wind_speed_10m']),
      windDirection: Number(current['wind_direction_10m']),
      isDay: Number(current['is_day']) === 1,
    },
    hourly: {
      time: (hourly['time'] ?? []) as string[],
      temperature: (hourly['temperature_2m'] ?? []) as number[],
      precipitationProbability: (hourly['precipitation_probability'] ?? []) as number[],
    },
    daily: {
      time: (daily['time'] ?? []) as string[],
      weatherCode: (daily['weather_code'] ?? []) as number[],
      maxTemperature: (daily['temperature_2m_max'] ?? []) as number[],
      minTemperature: (daily['temperature_2m_min'] ?? []) as number[],
      precipitationSum: (daily['precipitation_sum'] ?? []) as number[],
      sunrise: (daily['sunrise'] ?? []) as string[],
      sunset: (daily['sunset'] ?? []) as string[],
    },
  };
}
