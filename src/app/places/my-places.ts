import { Component, computed, input, output, signal } from '@angular/core';
import { MapLayer, Place, PointTimeline } from '../core/models';
import { LAYER_UNITS, colorForValue, formatValue, layerValueAtHour } from '../core/scales';
import { describeWeather } from '../core/weather-codes';

type SortBy = 'added' | 'value';

/**
 * Τα αποθηκευμένα μέρη δίπλα δίπλα, στην ίδια ώρα με τον slider του χάρτη,
 * ώστε ο χρήστης να τα συγκρίνει όπως ο παρουσιαστής συγκρίνει πόλεις.
 */
@Component({
  selector: 'app-my-places',
  templateUrl: './my-places.html',
  styleUrl: './my-places.scss',
})
export class MyPlaces {
  /**
   * Inputs: δεδομένα που δίνει ο γονέας (στο template του).
   * - savedPlaces: Τα αποθηκευμένα μέρη (από το store, μέσω του app.html).
   * - timelines: Τα δεδομένα καιρού για κάθε αποθηκευμένο μέρος, με κλειδί το id.
   * - layer: Το ίδιο layer με τον χάρτη, για να συγκρίνεις το ίδιο πράγμα.
   * - hour: Η ίδια ώρα με τον slider του χάρτη.
   * - selectedId: Το id του μέρους που είναι ανοιχτό στο πάνελ (η κάρτα του τονίζεται).
   */
  readonly savedPlaces = input<Place[]>([]);
  readonly timelines = input<Map<string, PointTimeline>>(new Map());
  readonly layer = input<MapLayer>('temperature');
  readonly hour = input(0);
  readonly selectedId = input<string | null>(null);

  /**
   * Outputs: γεγονότα προς τον γονέα, που τα ακούει με (όνομα)="…".
   * - placeOpened: κλικ σε κάρτα (άνοιξέ τη στο πάνελ).
   * - placeRemoved: πατήθηκε το ✕ μιας κάρτας.
   * - clearAllClicked: πατήθηκε το «Clear all».
   */
  readonly placeOpened = output<Place>();
  readonly placeRemoved = output<Place>();
  readonly clearAllClicked = output<void>();

  /** Σειρά καρτών: με τη σειρά που μπήκαν ή «Highest first». */
  readonly sortBy = signal<SortBy>('added');

  /** Μία κάρτα ανά μέρος: τιμή, χρώμα, εικονίδιο και μικρό γράφημα 24 ωρών, στην ώρα του slider. */
  readonly placeCards = computed(() => {
    const layer = this.layer();
    const hour = this.hour();
    const cards = this.savedPlaces().map((place) => {
      const timeline = this.timelines().get(place.id);
      if (!timeline) {
        // Η πρόγνωση δεν έχει έρθει ακόμα: κάρτα σε αναμονή.
        return { place, value: NaN, text: '…', color: 'var(--line)', icon: '', sparkline: null };
      }
      const index = Math.min(hour, timeline.time.length - 1);
      const value = layerValueAtHour(layer, timeline, hour);
      const hourlyValues =
        layer === 'precipitation' ? timeline.precipitation : layer === 'wind' ? timeline.windSpeed : timeline.temperature;
      return {
        place,
        value,
        text: formatValue(layer, value),
        color: colorForValue(layer, value),
        icon: describeWeather(timeline.weatherCode[index], timeline.isDay[index] === 1).icon,
        sparkline: buildSparkline(hourlyValues, index),
      };
    });
    if (this.sortBy() === 'value') cards.sort((first, second) => (second.value || 0) - (first.value || 0));
    return cards;
  });

  /** Η μεγαλύτερη και η μικρότερη τιμή των αποθηκευμένων, για τη σύνοψη μίας γραμμής. */
  readonly highestAndLowest = computed(() => {
    const cardsWithValues = this.placeCards().filter((card) => !Number.isNaN(card.value));
    if (cardsWithValues.length < 2) return null;
    const highestFirst = [...cardsWithValues].sort((first, second) => second.value - first.value);
    return { top: highestFirst[0], bottom: highestFirst[highestFirst.length - 1], unit: LAYER_UNITS[this.layer()] };
  });
}

/** Μικρή γραμμή 24 ωρών (viewBox 0..100 × 0..24) με τελεία στην επιλεγμένη ώρα. */
function buildSparkline(hourlyValues: number[], selectedHour: number): { path: string; dotX: number; dotY: number } {
  const min = Math.min(...hourlyValues);
  const span = Math.max(Math.max(...hourlyValues) - min, 1);
  const xForHour = (hourIndex: number) => (hourIndex / Math.max(hourlyValues.length - 1, 1)) * 100;
  const yForValue = (value: number) => 21 - ((value - min) / span) * 18;
  return {
    path: hourlyValues.map((value, hourIndex) => `${hourIndex ? 'L' : 'M'}${xForHour(hourIndex).toFixed(1)},${yForValue(value).toFixed(1)}`).join(' '),
    dotX: xForHour(selectedHour),
    dotY: yForValue(hourlyValues[selectedHour]),
  };
}
