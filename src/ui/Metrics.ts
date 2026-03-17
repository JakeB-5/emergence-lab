import type { Metrics } from '../types';

/**
 * Metrics dashboard panel.
 * Displays simulation metrics as a grid of cards with
 * animated value-change highlights.
 */
export class MetricsPanel {
  private container: HTMLElement;
  private cards: Map<string, { card: HTMLElement; valueEl: HTMLElement; lastValue: string }> =
    new Map();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Update all metrics from simulation */
  update(metrics: Metrics): void {
    const keys = Object.keys(metrics);

    for (const key of keys) {
      const entry = metrics[key];
      const displayValue = String(entry.value);

      let record = this.cards.get(key);

      if (!record) {
        // Create new card
        const card = document.createElement('div');
        card.className = 'metric-card fade-in';

        const label = document.createElement('div');
        label.className = 'metric-label';
        label.textContent = entry.label;

        const valueEl = document.createElement('div');
        valueEl.className = 'metric-value';
        valueEl.textContent = displayValue;

        card.appendChild(label);
        card.appendChild(valueEl);
        this.container.appendChild(card);

        record = { card, valueEl, lastValue: displayValue };
        this.cards.set(key, record);
      } else {
        // Update existing card - highlight if value changed
        if (record.lastValue !== displayValue) {
          record.valueEl.textContent = displayValue;
          record.lastValue = displayValue;

          // Brief highlight animation
          record.card.classList.add('highlight');
          setTimeout(() => {
            record!.card.classList.remove('highlight');
          }, 300);
        }
      }
    }

    // Remove cards for keys no longer present
    for (const [key, record] of this.cards) {
      if (!(key in metrics)) {
        record.card.remove();
        this.cards.delete(key);
      }
    }
  }

  /** Clear panel */
  clear(): void {
    this.container.innerHTML = '';
    this.cards.clear();
  }
}
