/**
 * Μικρή cache με λήξη, για να μένουν λίγα τα αιτήματα στο Open-Meteo.
 *
 * - Το `get` δίνει τιμή μόνο όσο είναι φρέσκια (νεότερη από `lifetimeMs`).
 * - Το προαιρετικό `storage` (π.χ. localStorage) κρατά τις απαντήσεις και μετά από reload.
 *
 * Οι προγνώσεις ανανεώνονται το πολύ μία φορά την ώρα, άρα 15 λεπτά λήξη δεν κοστίζουν τίποτα στον χρήστη.
 */
export class ExpiringCache<T> {
  /** Το αντίγραφο στη μνήμη: γρήγορο, χάνεται στο reload. `savedAt` = πότε μπήκε η τιμή. */
  private readonly memoryCopy = new Map<string, { savedAt: number; value: T }>();

  /** lifetimeMs: πόσο ζει μια τιμή · storage: πού σώζεται (π.χ. localStorage) · storageKeyPrefix: για να μη μπλέκονται οι caches · now: το ρολόι (στα τεστ περνάμε ψεύτικο). */
  constructor(
    private readonly lifetimeMs: number,
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    private readonly storageKeyPrefix = 'wx:',
    private readonly now: () => number = Date.now,
  ) {}

  /** Δίνει την τιμή αν υπάρχει και είναι φρέσκια· αλλιώς undefined (και σβήνει την παλιά). */
  get(key: string): T | undefined {
    const entry = this.memoryCopy.get(key) ?? this.readStorage(key);
    if (!entry) return undefined;
    if (!(this.now() - entry.savedAt <= this.lifetimeMs)) {
      this.delete(key);
      return undefined;
    }
    this.memoryCopy.set(key, entry);
    return entry.value;
  }

  /** Σώζει μια τιμή με την τωρινή ώρα, σε μνήμη και storage. */
  set(key: string, value: T): void {
    const entry = { savedAt: this.now(), value };
    this.memoryCopy.set(key, entry);
    try {
      this.storage?.setItem(this.storageKeyPrefix + key, JSON.stringify(entry));
    } catch {
      // Γεμάτο ή μπλοκαρισμένο storage (ιδιωτική περιήγηση): φτάνει το αντίγραφο στη μνήμη.
    }
  }

  /** Σβήνει μια τιμή από μνήμη και storage. */
  delete(key: string): void {
    this.memoryCopy.delete(key);
    try {
      this.storage?.removeItem(this.storageKeyPrefix + key);
    } catch {
      /* αγνόησέ το */
    }
  }

  /** Διαβάζει από το storage (π.χ. μετά από reload). Αν κάτι πάει στραβά, απλώς δεν βρίσκει τίποτα. */
  private readStorage(key: string): { savedAt: number; value: T } | undefined {
    try {
      const storedJson = this.storage?.getItem(this.storageKeyPrefix + key);
      return storedJson ? (JSON.parse(storedJson) as { savedAt: number; value: T }) : undefined;
    } catch {
      return undefined;
    }
  }
}
