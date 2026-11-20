/**
 * Μετατρέπει το ορατό κομμάτι του χάρτη σε λίγα σημεία δειγματοληψίας.
 *
 * Γιατί πλέγμα που «κουμπώνει»: τα σημεία εξαρτώνται μόνο από το zoom, ποτέ από
 * την ακριβή θέση σε pixel. Όταν γυρνάς σε μια περιοχή, βγαίνουν οι ΙΔΙΕΣ
 * συντεταγμένες, άρα οι απαντήσεις έρχονται από την cache αντί για νέο αίτημα.
 */
export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Ένα σημείο του πλέγματος, για το οποίο ζητάμε καιρό.
 * - key: το κλειδί για την cache, "lat,lon". Ίδιο σημείο → ίδιο κλειδί → έρχεται από την cache.
 */
export interface GridPoint {
  lat: number;
  lon: number;
  key: string;
}

/**
 * Σταθερή λίστα επιτρεπτών βημάτων (σε μοίρες). Το «κούμπωμα» σε αυτή τη λίστα
 * κρατά τα σημεία ίδια από επίσκεψη σε επίσκεψη, κι έτσι δουλεύει η cache.
 */
export const GRID_STEPS_IN_DEGREES = [0.25, 0.5, 1, 2, 2.5, 5, 7.5, 10, 15, 20, 30, 45, 60];

/**
 * Μοίρες ανάμεσα στα σημεία, ώστε τα κουτάκια να απέχουν τουλάχιστον `spacingPx` στην οθόνη.
 * Ένας χάρτης Web-Mercator δείχνει 360° σε 256·2^zoom pixel.
 */
export function gridStepForZoom(zoom: number, spacingPx = 90): number {
  const degreesPerPixel = 360 / (256 * Math.pow(2, zoom));
  const wanted = spacingPx * degreesPerPixel;
  return GRID_STEPS_IN_DEGREES.find((step) => step >= wanted) ?? GRID_STEPS_IN_DEGREES[GRID_STEPS_IN_DEGREES.length - 1];
}

/**
 * Τα κέντρα των κελιών που καλύπτουν τα `bounds`. Αν βγαίνουν πάνω από `maxPoints`,
 * παίρνει το επόμενο μεγαλύτερο βήμα, ώστε μία οθόνη να μην κοστίζει ποτέ πάνω από `maxPoints` τοποθεσίες.
 */
export function sampleGridPoints(bounds: MapBounds, zoom: number, maxPoints = 60): GridPoint[] {
  const start = GRID_STEPS_IN_DEGREES.indexOf(gridStepForZoom(zoom));

  // Δοκίμασε το βήμα του zoom· αν βγαίνουν πολλά σημεία, το επόμενο μεγαλύτερο, κ.ο.κ.
  for (let stepIndex = start; stepIndex < GRID_STEPS_IN_DEGREES.length; stepIndex++) {
    const points = cellCentres(bounds, GRID_STEPS_IN_DEGREES[stepIndex]);
    if (points.length <= maxPoints) return points;
  }

  // Ακόμα και το μεγαλύτερο βήμα έδωσε πολλά: κράτα μόνο τα πρώτα maxPoints.
  return cellCentres(bounds, GRID_STEPS_IN_DEGREES[GRID_STEPS_IN_DEGREES.length - 1]).slice(0, maxPoints);
}

function cellCentres(bounds: MapBounds, step: number): GridPoint[] {
  // Ο χάρτης δείχνει μία Γη: κόβουμε ό,τι βγαίνει έξω από αυτήν.
  const south = Math.max(bounds.south, -85);
  const north = Math.min(bounds.north, 85);
  const west = Math.max(bounds.west, -180);
  const east = Math.min(bounds.east, 179.999);
  const points: GridPoint[] = [];
  const firstRow = Math.floor(south / step);
  const lastRow = Math.floor(north / step);
  const firstColumn = Math.floor(west / step);
  const lastColumn = Math.floor(east / step);
  for (let row = firstRow; row <= lastRow; row++) {
    const lat = roundToThreeDecimals((row + 0.5) * step); // +0.5 = το κέντρο του κελιού
    if (lat < -85 || lat > 85) continue;
    for (let column = firstColumn; column <= lastColumn; column++) {
      const lon = roundToThreeDecimals((column + 0.5) * step);
      points.push({ lat, lon, key: `${lat},${lon}` });
    }
  }
  return points;
}

function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000; // 3 δεκαδικά
}
