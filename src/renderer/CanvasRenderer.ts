/**
 * Canvas management and rendering orchestration.
 * Handles HiDPI scaling, responsive resizing via ResizeObserver,
 * and provides clear/dimension utilities.
 */
export class CanvasRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number = 0;
  height: number = 0;

  private dpr: number;
  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;
    this.dpr = window.devicePixelRatio || 1;

    // Observe the canvas container for size changes
    const container = canvas.parentElement;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });

    if (container) {
      this.resizeObserver.observe(container);
    }

    // Initial sizing
    this.resize();
  }

  /** Handle resize, maintain pixel ratio for HiDPI displays */
  resize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;

    this.dpr = window.devicePixelRatio || 1;

    // Use container's CSS dimensions as the logical size
    const rect = container.getBoundingClientRect();
    const displayWidth = Math.floor(rect.width);
    const displayHeight = Math.floor(rect.height);

    // Set the canvas buffer size (scaled for HiDPI)
    this.canvas.width = displayWidth * this.dpr;
    this.canvas.height = displayHeight * this.dpr;

    // Set the CSS display size
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;

    // Scale the context so drawing operations use CSS pixels
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Store logical (CSS pixel) dimensions
    this.width = displayWidth;
    this.height = displayHeight;
  }

  /** Clear canvas with optional background color */
  clear(color?: string): void {
    if (color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(0, 0, this.width, this.height);
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  /** Get current logical dimensions */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Clean up observer */
  destroy(): void {
    this.resizeObserver.disconnect();
  }
}
