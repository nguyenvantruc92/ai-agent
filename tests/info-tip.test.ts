import { describe, expect, it } from 'vitest';
import { tipPosition } from '@/components/admin-ui/info-tip';

const viewport = { width: 1280, height: 800 };
const icon = (left: number, top: number) => ({ left, right: left + 16, top, bottom: top + 16 });

describe('info tooltip position', () => {
  it('sits above the icon, centred on it', () => {
    const place = tipPosition(icon(600, 400), 60, viewport);
    expect(place.width).toBe(288);
    expect(place.left).toBe(608 - 144);
    expect(place.top).toBe(400 - 60 - 8);
  });

  it('stays inside the viewport at the left and right edges', () => {
    expect(tipPosition(icon(2, 400), 60, viewport).left).toBe(12);
    expect(tipPosition(icon(1270, 400), 60, viewport).left).toBe(1280 - 288 - 12);
  });

  it('drops below the icon when there is no room above, and narrows on small screens', () => {
    expect(tipPosition(icon(600, 20), 60, viewport).top).toBe(20 + 16 + 8);
    expect(tipPosition(icon(100, 400), 60, { width: 300, height: 640 }).width).toBe(276);
  });
});
