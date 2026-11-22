import { describe, expect, it } from 'vitest';
import { reconstructColumns } from '../../src/vault/text-extraction.js';

describe('column reconstruction', () => {
  it('orders single-column items top-to-bottom and left-to-right', () => {
    const items = [
      { str: 'Line 2', x: 50, y: 500, width: 100, height: 10 },
      { str: 'Line 1', x: 50, y: 700, width: 100, height: 10 },
      { str: 'Line 3', x: 50, y: 300, width: 100, height: 10 },
    ];
    const text = reconstructColumns(items);
    expect(text).toBe('Line 1 Line 2 Line 3');
  });

  it('reconstructs multi-column layout by columns to avoid column interleaving', () => {
    const items = [
      // Left column (x ~ 50)
      { str: 'Left Header', x: 50, y: 800, width: 100, height: 10 },
      { str: 'Left Body 1', x: 50, y: 700, width: 100, height: 10 },
      { str: 'Left Body 2', x: 50, y: 600, width: 100, height: 10 },
      { str: 'Left Body 3', x: 50, y: 500, width: 100, height: 10 },
      { str: 'Left Footer', x: 50, y: 400, width: 100, height: 10 },
      // Right column (x ~ 400)
      { str: 'Right Header', x: 400, y: 800, width: 100, height: 10 },
      { str: 'Right Body 1', x: 400, y: 700, width: 100, height: 10 },
      { str: 'Right Body 2', x: 400, y: 600, width: 100, height: 10 },
      { str: 'Right Body 3', x: 400, y: 500, width: 100, height: 10 },
      { str: 'Right Footer', x: 400, y: 400, width: 100, height: 10 },
    ];
    const text = reconstructColumns(items);
    const lines = text.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('Left Header');
    expect(lines[0]).toContain('Left Footer');
    expect(lines[1]).toContain('Right Header');
    expect(lines[1]).toContain('Right Footer');
  });
});
