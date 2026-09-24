import { EstateWebException } from '../exceptions/estateweb.exception';
import { assertValidImageReorder } from './estateweb-property-validation.util';

describe('assertValidImageReorder', () => {
  it('accepts a valid ordered list', () => {
    expect(() =>
      assertValidImageReorder({
        data: [
          { id: 1203884, zindex: 1 },
          { id: 1203885, zindex: 2 },
        ],
      }),
    ).not.toThrow();
  });

  it.each([
    ['empty data', { data: [] }],
    ['non-positive id', { data: [{ id: 0, zindex: 1 }] }],
    ['fractional zindex', { data: [{ id: 5, zindex: 1.5 }] }],
    ['negative zindex', { data: [{ id: 5, zindex: -1 }] }],
    [
      'duplicate ids',
      {
        data: [
          { id: 5, zindex: 1 },
          { id: 5, zindex: 2 },
        ],
      },
    ],
  ])('rejects %s', (_label, payload) => {
    expect(() => assertValidImageReorder(payload)).toThrow(EstateWebException);
  });
});
