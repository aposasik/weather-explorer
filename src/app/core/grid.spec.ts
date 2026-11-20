import { GRID_STEPS_IN_DEGREES, gridStepForZoom, sampleGridPoints } from './grid';

describe('grid', () => {
  it('picks a step from the fixed list, smaller when zoomed in', () => {
    expect(GRID_STEPS_IN_DEGREES).toContain(gridStepForZoom(3));
    expect(gridStepForZoom(6)).toBeLessThan(gridStepForZoom(3));
  });

  it('never returns more points than the limit', () => {
    const world = { south: -80, west: -180, north: 80, east: 180 };
    expect(sampleGridPoints(world, 2, 60).length).toBeLessThanOrEqual(60);
    expect(sampleGridPoints(world, 2, 10).length).toBeLessThanOrEqual(10);
  });

  it('gives the same points for a slightly moved view (so the cache is hit)', () => {
    const firstView = sampleGridPoints({ south: 30, west: 10, north: 50, east: 40 }, 5).map((point) => point.key);
    const movedView = sampleGridPoints({ south: 30.3, west: 10.4, north: 50.3, east: 40.4 }, 5).map((point) => point.key);
    const sharedKeys = firstView.filter((key) => movedView.includes(key));
    expect(sharedKeys.length / firstView.length).toBeGreaterThan(0.7);
  });

  it('never goes outside the one world (-180..180)', () => {
    const points = sampleGridPoints({ south: 0, west: 170, north: 10, east: 200 }, 5);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => point.lon >= -180 && point.lon <= 180)).toBe(true);
  });
});
