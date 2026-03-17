import type { ParamDef } from '../types';

/**
 * Parameter control panel manager.
 * Builds labeled range sliders from simulation param definitions
 * and fires callbacks on value changes.
 */
export class Controls {
  private container: HTMLElement;
  private onParamChange: (key: string, value: number) => void;
  private elements: Map<string, { input: HTMLInputElement; valueDisplay: HTMLSpanElement }> =
    new Map();

  constructor(container: HTMLElement, onParamChange: (key: string, value: number) => void) {
    this.container = container;
    this.onParamChange = onParamChange;
  }

  /** Build slider controls from simulation's param definitions */
  setParams(params: ParamDef[]): void {
    this.clear();

    for (const param of params) {
      const group = document.createElement('div');
      group.className = 'control-group fade-in';

      // Header row: label + current value
      const header = document.createElement('div');
      header.className = 'control-header';

      const label = document.createElement('span');
      label.className = 'control-label';
      label.textContent = param.label;

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'control-value';
      valueDisplay.textContent = this.formatValue(param.default, param.step);

      header.appendChild(label);
      header.appendChild(valueDisplay);

      // Range slider
      const rangeWrap = document.createElement('div');
      rangeWrap.className = 'control-range';

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(param.min);
      input.max = String(param.max);
      input.step = String(param.step);
      input.value = String(param.default);

      // Real-time updates via input event (not change)
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        valueDisplay.textContent = this.formatValue(val, param.step);
        this.onParamChange(param.key, val);
      });

      rangeWrap.appendChild(input);

      // Min/max bounds display
      const bounds = document.createElement('div');
      bounds.className = 'control-bounds';

      const minSpan = document.createElement('span');
      minSpan.textContent = String(param.min);

      const maxSpan = document.createElement('span');
      maxSpan.textContent = String(param.max);

      bounds.appendChild(minSpan);
      bounds.appendChild(maxSpan);

      group.appendChild(header);
      group.appendChild(rangeWrap);
      group.appendChild(bounds);

      this.container.appendChild(group);
      this.elements.set(param.key, { input, valueDisplay });
    }
  }

  /** Update displayed value without triggering callback */
  updateValue(key: string, value: number): void {
    const el = this.elements.get(key);
    if (!el) return;

    el.input.value = String(value);
    const step = parseFloat(el.input.step);
    el.valueDisplay.textContent = this.formatValue(value, step);
  }

  /** Clear all controls */
  clear(): void {
    this.container.innerHTML = '';
    this.elements.clear();
  }

  /** Format a number for display based on step precision */
  private formatValue(value: number, step: number): string {
    if (step >= 1) return String(Math.round(value));
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    return value.toFixed(decimals);
  }
}
