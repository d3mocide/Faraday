import { describe, expect, it } from 'vitest';
import { threeMfModelXml } from '../src/export/threeMfExport';

describe('3MF serialization', () => {
  it('emits one printable object and build item per exported part', () => {
    const xml = threeMfModelXml([
      {
        id: 'base',
        label: 'Base',
        kind: 'base',
        mesh: {
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          indices: new Uint32Array([0, 1, 2]),
        },
      },
    ]);
    expect(xml).toContain('unit="millimeter"');
    expect(xml).toContain('<object id="1" type="model" name="Base">');
    expect(xml).toContain('<triangle v1="0" v2="1" v3="2"/>');
    expect(xml).toContain('<item objectid="1"/>');
  });
});
