import { describe, expect, test } from '@jest/globals';
import { validateExtensionEndTime } from '../reservation.rules';

describe('validateExtensionEndTime', () => {
  const currentEnd = new Date('2026-10-13T12:00:00.000Z');
  const now = new Date('2026-10-13T10:00:00.000Z');

  test('acepta una nueva hora de fin que sea estrictamente posterior a la actual', () => {
    const newEndInput = '2026-10-13T13:30:00.000Z';
    const result = validateExtensionEndTime(currentEnd, newEndInput, now);

    expect(result).toEqual(new Date(newEndInput));
  });

  test('rechaza una nueva hora de fin idéntica a la hora final actual', () => {
    const newEndInput = '2026-10-13T12:00:00.000Z';
    const result = validateExtensionEndTime(currentEnd, newEndInput, now);

    expect(result).toBeNull();
  });

  test('rechaza una nueva hora de fin anterior a la hora final actual', () => {
    const newEndInput = '2026-10-13T11:00:00.000Z';
    const result = validateExtensionEndTime(currentEnd, newEndInput, now);

    expect(result).toBeNull();
  });

  test('rechaza una entrada que no es una fecha válida', () => {
    const result = validateExtensionEndTime(currentEnd, 'not-a-valid-date', now);

    expect(result).toBeNull();
  });

  test('rechaza cuando el input no es un string', () => {
    expect(validateExtensionEndTime(currentEnd, null, now)).toBeNull();
    expect(validateExtensionEndTime(currentEnd, undefined, now)).toBeNull();
    expect(validateExtensionEndTime(currentEnd, 12345678, now)).toBeNull();
  });
});