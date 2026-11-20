/**
 * Κωδικοί καιρού WMO (όπως τους επιστρέφει το Open-Meteo στο `weather_code`) → κείμενο και εικονίδιο.
 * Πηγή: https://open-meteo.com/en/docs (ενότητα "WMO Weather interpretation codes").
 * WeatherDescription: label = περιγραφή στα αγγλικά ("Light rain"), icon = emoji.
 */
export interface WeatherDescription {
  label: string;
  icon: string; // emoji: δεν χρειάζεται γραμματοσειρά εικονιδίων ή εικόνες
}

const WMO_WEATHER_CODES: Record<number, WeatherDescription> = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mainly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Dense drizzle', icon: '🌧️' },
  56: { label: 'Freezing drizzle', icon: '🌧️' },
  57: { label: 'Freezing drizzle', icon: '🌧️' },
  61: { label: 'Light rain', icon: '🌦️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🌧️' },
  67: { label: 'Freezing rain', icon: '🌧️' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '🌨️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '🌨️' },
  80: { label: 'Rain showers', icon: '🌦️' },
  81: { label: 'Rain showers', icon: '🌧️' },
  82: { label: 'Violent showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Snow showers', icon: '❄️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm, hail', icon: '⛈️' },
  99: { label: 'Thunderstorm, hail', icon: '⛈️' },
};

/** Από κωδικό WMO σε κείμενο και εικονίδιο. Άγνωστος κωδικός → "Unknown" ❔ (ποτέ σφάλμα). */
export function describeWeather(code: number | null | undefined, isDay = true): WeatherDescription {
  const description = code == null ? undefined : WMO_WEATHER_CODES[code];
  if (!description) return { label: 'Unknown', icon: '❔' };
  // Καθαρός / σχεδόν καθαρός ουρανός τη νύχτα: φεγγάρι αντί για ήλιο.
  if (!isDay && (code === 0 || code === 1)) return { ...description, icon: '🌙' };
  return description;
}
