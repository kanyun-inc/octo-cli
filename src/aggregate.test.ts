import { afterEach, describe, expect, it, vi } from 'vitest';
import { warnMissingGroups } from './aggregate.js';

describe('aggregation evidence', () => {
  afterEach(() => vi.restoreAllMocks());
  it('warns when positive totals are returned without requested groups', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    warnMissingGroups(
      [{ fields: {}, values: { 'count(*)': 42 } }],
      [{ field: 'errorInfo' }]
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('no groups returned for errorInfo')
    );
  });
  it('warns about a missing dimension even if another dimension was grouped', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    warnMissingGroups(
      [{ fields: { service: 'a' }, values: {} }],
      [{ field: 'service' }, { field: 'errorInfo' }]
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('no groups returned for errorInfo.')
    );
  });
  it('accepts valid groups, total-only requests, and genuine empty results', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    warnMissingGroups(
      [{ fields: { service: null }, values: {} }],
      [{ field: 'service' }]
    );
    warnMissingGroups([{ fields: {}, values: { 'count(*)': 42 } }], []);
    warnMissingGroups(
      [{ fields: {}, values: { 'count(*)': 0 } }],
      [{ field: 'service' }]
    );
    warnMissingGroups([], [{ field: 'service' }]);
    expect(error).not.toHaveBeenCalled();
  });
});
