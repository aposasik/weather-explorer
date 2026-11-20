import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { MapBounds } from '../core/grid';
import { MapLayer, Place, PointTimeline } from '../core/models';
import { colorForValue, formatValue, layerValueAtHour } from '../core/scales';
import { describeWeather } from '../core/weather-codes';

/**
 * Ο χάρτης του κόσμου. Μόνο ΖΩΓΡΑΦΙΖΕΙ: ποια δεδομένα θα δείξει το αποφασίζει ο γονέας.
 * - inputs: timelines (ένα ανά σημείο), layer, ώρα, μέρη για καρφίτσες
 * - outputs: viewChanged (όταν σταματήσει η κίνηση), pointPicked (κλικ / άγγιγμα)
 */
@Component({
  selector: 'app-world-map',
  template: `<div #mapContainer class="map" role="application" aria-label="World weather map. Click anywhere to see its forecast."></div>`,
  styleUrl: './world-map.scss',
})
export class WorldMap {
  /**
   * Inputs: δεδομένα που δίνει ο γονέας (στο template του).
   * - timelines: Τα δεδομένα για κάθε σημείο του πλέγματος: ένα κουτάκι ανά timeline.
   * - layer: Ποια μεταβλητή ζωγραφίζουν τα κουτάκια.
   * - hour: Ποια ώρα του slider δείχνουν τα κουτάκια.
   * - savedPlaces: Τα αποθηκευμένα μέρη: κίτρινες καρφίτσες με όνομα.
   * - focusedPlace: Το επιλεγμένο μέρος: ο χάρτης «πετάει» εκεί.
   */
  readonly timelines = input<Map<string, PointTimeline>>(new Map());
  readonly layer = input<MapLayer>('temperature');
  readonly hour = input(0);
  readonly savedPlaces = input<Place[]>([]);
  readonly focusedPlace = input<Place | null>(null);

  /**
   * Outputs: γεγονότα προς τον γονέα, που τα ακούει με (όνομα)="…".
   * - viewChanged: ο χρήστης σταμάτησε να κουνάει τον χάρτη (στέλνει όρια και zoom).
   * - pointPicked: κλικ στον χάρτη ή σε κουτάκι.
   * - savedPinClicked: κλικ σε καρφίτσα αποθηκευμένου μέρους.
   */
  readonly viewChanged = output<{ bounds: MapBounds; zoom: number }>();
  readonly pointPicked = output<{ lat: number; lon: number }>();
  readonly savedPinClicked = output<Place>();

  /**
   * - mapContainer: Το <div> του template όπου «μπαίνει» ο Leaflet χάρτης.
   * - map: Ο Leaflet χάρτης. Φτιάχνεται μία φορά, στο afterNextRender.
   * - weatherChipsLayer: Ομάδα με τα κουτάκια καιρού: την αδειάζουμε και την ξαναγεμίζουμε σε κάθε αλλαγή.
   * - savedPinsLayer: Ομάδα με τις καρφίτσες των αποθηκευμένων.
   */
  private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map?: L.Map;
  private readonly weatherChipsLayer = L.layerGroup();
  private readonly savedPinsLayer = L.layerGroup();

  /** Φτιάχνει τον χάρτη όταν υπάρχει το <div>, στήνει τα effects που ξαναζωγραφίζουν, και τον καθαρίζει στο τέλος. */
  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const map = L.map(this.mapContainer().nativeElement, {
        center: [30, 15],
        zoom: 3,
        minZoom: 2,
        maxZoom: 10,
        zoomControl: false,
        // Μία Γη, χωρίς επανάληψη δεξιά-αριστερά: ο χρήστης δεν βγαίνει έξω από τον χάρτη.
        maxBounds: [[-85, -180], [85, 180]],
        maxBoundsViscosity: 1,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const esri = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas';
      L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
        maxNativeZoom: 16,
        noWrap: true,
      }).addTo(map);
      // Ονόματα χωρών / πόλεων πάνω από τα χρωματιστά κουτάκια, για να αναγνωρίζεις πού κοιτάς.
      map.createPane('labels');
      map.getPane('labels')!.style.zIndex = '450';
      map.getPane('labels')!.style.pointerEvents = 'none';
      L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
        pane: 'labels',
        maxNativeZoom: 16,
        noWrap: true,
      }).addTo(map);

      this.weatherChipsLayer.addTo(map);
      this.savedPinsLayer.addTo(map);

      // Το 'moveend' έρχεται μία φορά στο τέλος του συρσίματος ή του zoom· ο γονέας κάνει και debounce από πάνω.
      map.on('moveend', () => this.emitVisibleArea());
      map.on('click', (event: L.LeafletMouseEvent) =>
        this.pointPicked.emit({ lat: event.latlng.lat, lon: event.latlng.lng }),
      );

      this.map = map;
      this.emitVisibleArea();
      this.drawWeatherChips();
      this.drawSavedPins();
    });

    // Ξαναζωγράφισε όταν αλλάζουν τα δεδομένα, το layer ή η ώρα.
    effect(() => {
      this.timelines();
      this.layer();
      this.hour();
      this.drawWeatherChips();
    });
    effect(() => {
      this.savedPlaces();
      this.drawSavedPins();
    });
    effect(() => {
      const place = this.focusedPlace();
      // «Πετάει» στο μέρος που επιλέχθηκε, με zoom τουλάχιστον 6.
      if (place && this.map) this.map.flyTo([place.lat, place.lon], Math.max(this.map.getZoom(), 6), { duration: 0.8 });
    });

    destroyRef.onDestroy(() => this.map?.remove());
  }

  /** Στέλνει προς τα πάνω τα όρια και το zoom που φαίνονται τώρα. */
  private emitVisibleArea(): void {
    if (!this.map) return;
    const visible = this.map.getBounds();
    this.viewChanged.emit({
      bounds: { south: visible.getSouth(), west: visible.getWest(), north: visible.getNorth(), east: visible.getEast() },
      zoom: this.map.getZoom(),
    });
  }

  /** Ξαναζωγραφίζει όλα τα κουτάκια καιρού για το τρέχον layer και την τρέχουσα ώρα. */
  private drawWeatherChips(): void {
    if (!this.map) return;
    this.weatherChipsLayer.clearLayers();
    const layer = this.layer();
    const hour = this.hour();
    for (const timeline of this.timelines().values()) {
      const value = layerValueAtHour(layer, timeline, hour);
      const index = Math.min(hour, timeline.time.length - 1);
      const look = describeWeather(timeline.weatherCode[index], timeline.isDay[index] === 1);
      // Στον άνεμο δείχνουμε βέλος προς τα πού φυσάει· αλλιώς το εικονίδιο του καιρού.
      const symbol =
        layer === 'wind'
          ? `<span class="arrow" style="transform:rotate(${timeline.windDirection[index] + 180}deg)">↑</span>`
          : `<span class="ico">${look.icon}</span>`;
      const icon = L.divIcon({
        className: 'chip-wrap',
        html: `<button class="chip" style="--weather-color:${colorForValue(layer, value)}" title="${look.label}">${symbol}<b>${formatValue(layer, value)}</b></button>`,
        iconSize: [64, 28],
        iconAnchor: [32, 14],
      });
      L.marker([timeline.lat, timeline.lon], { icon, keyboard: false })
        .on('click', () => this.pointPicked.emit({ lat: timeline.lat, lon: timeline.lon }))
        .addTo(this.weatherChipsLayer);
    }
  }

  /** Ξαναζωγραφίζει τις καρφίτσες των αποθηκευμένων μερών. */
  private drawSavedPins(): void {
    if (!this.map) return;
    this.savedPinsLayer.clearLayers();
    for (const place of this.savedPlaces()) {
      const icon = L.divIcon({
        className: 'pin-wrap',
        html: `<span class="pin" aria-hidden="true"></span><span class="pin-name">${escapeHtml(place.name)}</span>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker([place.lat, place.lon], { icon, zIndexOffset: 1000, title: place.name })
        .on('click', () => this.savedPinClicked.emit(place))
        .addTo(this.savedPinsLayer);
    }
  }
}

/** Το όνομα μπαίνει σε HTML: ειδικοί χαρακτήρες (< > & " ') γίνονται ασφαλείς, για να μη «σπάσει» η σελίδα. */
function escapeHtml(text: string): string {
  const safe: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (character) => safe[character]);
}
