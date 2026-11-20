import { MapLayer, PointTimeline } from './models';

/**
 * Χρωματικές κλίμακες για τον χάρτη, σαν τις χρωματιστές περιοχές ενός τηλεοπτικού δελτίου.
 * Κάθε σημείο είναι [τιμή, χρώμα]· για τις ενδιάμεσες τιμές βγαίνει το ενδιάμεσο χρώμα.
 */
type ColorStop = [number, [number, number, number]];

const TEMPERATURE_COLORS: ColorStop[] = [
  [-30, [94, 60, 153]],
  [-15, [59, 110, 214]],
  [0, [86, 180, 233]],
  [10, [120, 200, 160]],
  [18, [240, 210, 90]],
  [26, [240, 150, 60]],
  [34, [215, 60, 50]],
  [42, [140, 20, 60]],
];

const PRECIPITATION_COLORS: ColorStop[] = [
  [0, [70, 80, 95]],
  [0.2, [110, 170, 220]],
  [1, [60, 130, 230]],
  [4, [40, 80, 200]],
  [10, [120, 60, 200]],
];

const WIND_COLORS: ColorStop[] = [
  [0, [90, 160, 140]],
  [15, [150, 200, 120]],
  [30, [240, 200, 80]],
  [50, [235, 120, 60]],
  [75, [200, 50, 70]],
];

/** Το χρώμα για μια τιμή, π.χ. 30°C → πορτοκαλί. Χρησιμοποιείται στα κουτάκια, στις κάρτες και στο υπόμνημα. */
export function colorForValue(layer: MapLayer, value: number): string {
  const stops =
    layer === 'temperature' ? TEMPERATURE_COLORS : layer === 'precipitation' ? PRECIPITATION_COLORS : WIND_COLORS;
  return blendColors(stops, value);
}

/** Η τιμή που δείχνουμε για ένα σημείο σε μια ώρα του slider (θερμοκρασία, βροχή ή άνεμος). */
export function layerValueAtHour(layer: MapLayer, timeline: PointTimeline, hour: number): number {
  const index = Math.min(hour, timeline.time.length - 1);
  if (layer === 'temperature') return timeline.temperature[index];
  if (layer === 'precipitation') return timeline.precipitation[index];
  return timeline.windSpeed[index];
}

/** Η τιμή ως κείμενο για την οθόνη: "12°", "0.4", "25". Αν λείπει: "–". */
export function formatValue(layer: MapLayer, value: number): string {
  if (value == null || Number.isNaN(value)) return '–';
  if (layer === 'temperature') return `${Math.round(value)}°`;
  if (layer === 'precipitation') return value === 0 ? '0' : `${value.toFixed(1)}`;
  return `${Math.round(value)}`;
}

/** Η μονάδα κάθε layer. Record<MapLayer, …>: αν προστεθεί layer και λείπει εδώ, ο TypeScript βγάζει σφάλμα. */
export const LAYER_UNITS: Record<MapLayer, string> = {
  temperature: '°C',
  precipitation: 'mm/h',
  wind: 'km/h',
};

/** Οι τιμές που δείχνει το υπόμνημα για κάθε layer. */
export const LAYER_LEGEND: Record<MapLayer, number[]> = {
  temperature: [-15, 0, 10, 18, 26, 34],
  precipitation: [0, 0.2, 1, 4, 10],
  wind: [0, 15, 30, 50, 75],
};

/** Βρίσκει ανάμεσα σε ποια δύο σημεία της κλίμακας πέφτει η τιμή και «ανακατεύει» τα δύο χρώματα. */
function blendColors(stops: ColorStop[], value: number): string {
  if (Number.isNaN(value)) return 'rgb(80,80,80)';
  if (value <= stops[0][0]) return rgb(stops[0][1]);
  for (let index = 1; index < stops.length; index++) {
    const [upperValue, upperColor] = stops[index];
    if (value <= upperValue) {
      const [lowerValue, lowerColor] = stops[index - 1];
      // 0 = ακριβώς στο κάτω σημείο, 1 = ακριβώς στο πάνω, 0.5 = στη μέση
      const fraction = (value - lowerValue) / (upperValue - lowerValue);
      const mixed = [0, 1, 2].map((channel) =>
        Math.round(lowerColor[channel] + (upperColor[channel] - lowerColor[channel]) * fraction),
      ) as [number, number, number];
      return rgb(mixed);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

function rgb([red, green, blue]: [number, number, number]): string {
  return `rgb(${red}, ${green}, ${blue})`;
}
