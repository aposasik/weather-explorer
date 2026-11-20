/**
 * Ένα σημείο στη Γη που μπορεί να δει ο χρήστης.
 * - id: σταθερό κλειδί, οι συντεταγμένες με 2 δεκαδικά ("40.64,22.93")
 * - name: όνομα για την οθόνη (πόλη από την αναζήτηση, ή συντεταγμένες αν ήταν κλικ στον χάρτη)
 * - country, region: χώρα και περιοχή, μόνο για μέρη από την αναζήτηση
 */
export interface Place {
  id: string;
  name: string;
  country?: string;
  region?: string;
  lat: number;
  lon: number;
}

/** Ποια μεταβλητή καιρού ζωγραφίζει ο χάρτης, όπως ο παρουσιαστής αλλάζει χάρτη στο δελτίο. */
export type MapLayer = 'temperature' | 'precipitation' | 'wind';

/**
 * Τιμές ώρα προς ώρα για ένα σημείο του χάρτη. Κάθε πίνακας έχει μία τιμή ανά ώρα, στην ίδια σειρά.
 * - time: οι ώρες σε ISO (UTC), π.χ. "2026-11-20T13:00"· η θέση 0 είναι η τρέχουσα ώρα
 * - temperature °C · precipitation mm · windSpeed km/h
 * - weatherCode: κωδικός καιρού WMO (δες weather-codes.ts)
 * - windDirection: από πού φυσάει, σε μοίρες (0 = βοριάς)
 * - isDay: 1 = μέρα, 0 = νύχτα (ήλιος ή φεγγάρι στο εικονίδιο)
 */
export interface PointTimeline {
  lat: number;
  lon: number;
  time: string[];
  temperature: number[];
  precipitation: number[];
  weatherCode: number[];
  windSpeed: number[];
  windDirection: number[];
  isDay: number[];
}

/**
 * Όλα όσα δείχνει το πάνελ για ένα μέρος. Οι ώρες είναι στην ώρα του τόπου (timezone=auto).
 * - timezone: π.χ. "Europe/Athens"
 * - current: ο καιρός τώρα (feelsLike = πώς «νιώθεται» η θερμοκρασία, humidity σε %)
 * - hourly: οι επόμενες 24 ώρες, για το γράφημα (θερμοκρασία και πιθανότητα βροχής %)
 * - daily: οι επόμενες 7 μέρες (μέγιστη/ελάχιστη θερμοκρασία, βροχή σε mm, ανατολή/δύση π.χ. "2026-11-20T07:20")
 */
export interface PlaceForecast {
  timezone: string;
  current: {
    time: string;
    temperature: number;
    feelsLike: number;
    humidity: number;
    precipitation: number;
    weatherCode: number;
    windSpeed: number;
    windDirection: number;
    isDay: boolean;
  };
  hourly: { time: string[]; temperature: number[]; precipitationProbability: number[] };
  daily: {
    time: string[];
    weatherCode: number[];
    maxTemperature: number[];
    minTemperature: number[];
    precipitationSum: number[];
    sunrise: string[];
    sunset: string[];
  };
}

/**
 * Ένα αποτέλεσμα της αναζήτησης (Geocoding API). Τα ονόματα είναι όπως τα στέλνει το API.
 * - id: το id της πόλης στο Open-Meteo
 * - latitude, longitude: οι συντεταγμένες (εμείς τις λέμε lat, lon)
 * - admin1: περιοχή/νομός · country_code: κωδικός χώρας 2 γραμμάτων ("GR"), για τη σημαία
 */
export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  country_code?: string;
}

/** Σταθερό κλειδί για ένα μέρος: συντεταγμένες με 2 δεκαδικά, π.χ. "40.64,22.93". */
export function makePlaceId(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/** Συντεταγμένες για την οθόνη, π.χ. "40.6°N 22.9°E". */
export function formatCoordinates(lat: number, lon: number): string {
  const northSouth = lat >= 0 ? 'N' : 'S';
  const eastWest = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${northSouth} ${Math.abs(lon).toFixed(1)}°${eastWest}`;
}
