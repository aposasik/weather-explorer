import { Injectable, computed, effect, signal } from '@angular/core';
import { Place } from './models';

const STORAGE_KEY = 'wx:places';

/**
 * «My places»: η δική του εικόνα του χρήστη για τον καιρό στον κόσμο.
 * Τα signals κρατούν την κατάσταση· ένα effect σώζει τη λίστα στο localStorage σε κάθε αλλαγή.
 */
@Injectable({ providedIn: 'root' })
export class PlacesStore {
  /**
   * Κατάσταση (signals): όταν αλλάζουν, η οθόνη ενημερώνεται μόνη της.
   * - savedPlaces: Τα αποθηκευμένα μέρη («My places»). Ξεκινά με ό,τι υπάρχει στο localStorage.
   * - selectedPlace: Το μέρος που δείχνει τώρα το πάνελ δεξιά. null = κανένα (φαίνεται το «Explore the world's weather»).
   * - myLocation: Το μέρος που βρήκε ο γεωεντοπισμός, χωριστά από τη λίστα των αποθηκευμένων.
   */
  readonly savedPlaces = signal<Place[]>(load());
  readonly selectedPlace = signal<Place | null>(null);
  readonly myLocation = signal<Place | null>(null);

  /** Αν το επιλεγμένο μέρος είναι στα αποθηκευμένα: γράφει «★ Saved» ή «☆ Save». */
  readonly isSelectedSaved = computed(() => {
    const selected = this.selectedPlace();
    return !!selected && this.savedPlaces().some((place) => place.id === selected.id);
  });

  /** Ένα effect που σώζει τη λίστα στο localStorage σε κάθε αλλαγή, χωρίς να το θυμάται κανείς χειροκίνητα. */
  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedPlaces()));
      } catch {
        /* ιδιωτική περιήγηση: η λίστα δουλεύει κανονικά για αυτή την επίσκεψη */
      }
    });
  }

  /** Ανοίγει (ή κλείνει, με null) το πάνελ για ένα μέρος. */
  select(place: Place | null): void {
    this.selectedPlace.set(place);
  }

  /** Το κουμπί «☆ Save»: αν το μέρος είναι αποθηκευμένο βγαίνει, αλλιώς μπαίνει στο τέλος. */
  toggleSaved(place: Place): void {
    this.savedPlaces.update((savedPlaces) =>
      savedPlaces.some((saved) => saved.id === place.id)
        ? savedPlaces.filter((saved) => saved.id !== place.id) // ήταν αποθηκευμένο → βγαίνει
        : [...savedPlaces, place], // δεν ήταν → μπαίνει στο τέλος
    );
  }

  /** Σβήνει όλα τα αποθηκευμένα. Το effect του constructor το γράφει μόνο του στο localStorage. */
  clearAll(): void {
    this.savedPlaces.set([]);
  }

  /** Το ✕ σε μια κάρτα: βγάζει αυτό το μέρος από τα αποθηκευμένα. */
  remove(id: string): void {
    this.savedPlaces.update((savedPlaces) => savedPlaces.filter((place) => place.id !== id));
  }

  /** Αλλάζει το όνομα ενός αποθηκευμένου μέρους (και στο πάνελ, αν είναι ανοιχτό). */
  rename(id: string, name: string): void {
    const clean = name.trim();
    if (!clean) return;
    this.savedPlaces.update((savedPlaces) => savedPlaces.map((place) => (place.id === id ? { ...place, name: clean } : place)));
    const selected = this.selectedPlace();
    if (selected?.id === id) this.selectedPlace.set({ ...selected, name: clean });
  }
}

function load(): Place[] {
  try {
    const storedJson = localStorage.getItem(STORAGE_KEY);
    const storedPlaces = storedJson ? (JSON.parse(storedJson) as Place[]) : [];
    return Array.isArray(storedPlaces) ? storedPlaces : [];
  } catch {
    return [];
  }
}
