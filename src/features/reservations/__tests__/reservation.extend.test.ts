import {
  canReserveSpot,
  hasTimeConflict,
  validateExtensionEndTime,
} from "../reservation.rules";
import { describe, expect, test } from "@jest/globals";

describe("validateExtensionEndTime", () => {
  const currentEnd = new Date("2026-10-13T12:00:00.000Z");
  const now = new Date("2026-10-13T10:00:00.000Z");

  test("TC-01: acepta una extensión válida estrictamente posterior a la hora actual", () => {
    // Happy Path: devuelve la fecha parseada si es posterior al fin actual.
    const newEndTime = "2026-10-13T13:00:00.000Z";

    const result = validateExtensionEndTime(currentEnd, newEndTime, now);

    expect(result).toEqual(new Date(newEndTime));
  });

  test("TC-02: rechaza una entrada con formato de fecha inválido", () => {
    // Error Case: no se puede convertir a fecha válida.
    const result = validateExtensionEndTime(currentEnd, "fecha-invalida", now);

    expect(result).toBeNull();
  });

  test("TC-03: rechaza una hora final anterior al fin actual", () => {
    // Error Case: la nueva hora termina antes de lo que ya estaba reservado.
    const result = validateExtensionEndTime(
      currentEnd,
      "2026-10-13T11:00:00.000Z",
      now
    );

    expect(result).toBeNull();
  });

  test("TC-04: rechaza una hora final idéntica a la actual", () => {
    // Error Case: duración de extensión cero.
    const result = validateExtensionEndTime(
      currentEnd,
      "2026-10-13T12:00:00.000Z",
      now
    );

    expect(result).toBeNull();
  });

  test("TC-05: rechaza cuando el argumento newEndTime no es una cadena de texto", () => {
    // Error Case: tipo de dato no admitido (null, undefined, number).
    expect(validateExtensionEndTime(currentEnd, null, now)).toBeNull();
    expect(validateExtensionEndTime(currentEnd, undefined, now)).toBeNull();
    expect(validateExtensionEndTime(currentEnd, 123456789, now)).toBeNull();
  });
});

describe("hasTimeConflict (Extensión de Reservaciones)", () => {
  // Simula el tramo extendido: de 12:00 a 13:00
  const extendedStart = new Date("2026-10-13T12:00:00.000Z");
  const extendedEnd = new Date("2026-10-13T13:00:00.000Z");

  test("TC-06: detecta conflicto cuando otra reservación solapa el periodo extendido", () => {
    // Error Case: otra reserva activa ocupa de 12:30 a 13:30.
    const otherStart = new Date("2026-10-13T12:30:00.000Z");
    const otherEnd = new Date("2026-10-13T13:30:00.000Z");

    const conflict = hasTimeConflict(
      extendedStart,
      extendedEnd,
      otherStart,
      otherEnd
    );

    expect(conflict).toBe(true);
  });

  test("TC-07: detecta conflicto cuando otra reservación está completamente contenida en la extensión", () => {
    // Error Case: otra reserva activa ocupa de 12:15 a 12:45.
    const otherStart = new Date("2026-10-13T12:15:00.000Z");
    const otherEnd = new Date("2026-10-13T12:45:00.000Z");

    const conflict = hasTimeConflict(
      extendedStart,
      extendedEnd,
      otherStart,
      otherEnd
    );

    expect(conflict).toBe(true);
  });

  test("TC-08: permite adyacencia exacta donde la extensión termina cuando la otra inicia", () => {
    // Edge Case: la extensión termina a las 13:00 y la siguiente inicia a las 13:00 exactas.
    const nextReservationStart = new Date("2026-10-13T13:00:00.000Z");
    const nextReservationEnd = new Date("2026-10-13T14:00:00.000Z");

    const conflict = hasTimeConflict(
      extendedStart,
      extendedEnd,
      nextReservationStart,
      nextReservationEnd
    );

    expect(conflict).toBe(false);
  });

  test("TC-09: permite extensión cuando la siguiente reservación ocurre completamente después", () => {
    // Edge Case: la siguiente reserva empieza a las 14:00, dejando un hueco libre.
    const otherStart = new Date("2026-10-13T14:00:00.000Z");
    const otherEnd = new Date("2026-10-13T15:00:00.000Z");

    const conflict = hasTimeConflict(
      extendedStart,
      extendedEnd,
      otherStart,
      otherEnd
    );

    expect(conflict).toBe(false);
  });

  test("TC-10: comprueba que el tramo original antes de la extensión no genera colisión consigo mismo", () => {
    // Edge Case: el intervalo de extensión [currentEnd, newEnd] comienza exactamente al terminar el original.
    const originalStart = new Date("2026-10-13T10:00:00.000Z");
    const originalEnd = new Date("2026-10-13T12:00:00.000Z");

    const conflict = hasTimeConflict(
      extendedStart,
      extendedEnd,
      originalStart,
      originalEnd
    );

    expect(conflict).toBe(false);
  });
});

describe("canReserveSpot (Reglas de Elegibilidad)", () => {
  test("TC-11: permite la extensión en un espacio activo sin conflicto de horario", () => {
    // Happy Path: espacio activo y hasConflict = false.
    const allowed = canReserveSpot(true, false);

    expect(allowed).toBe(true);
  });

  test("TC-12: rechaza la extensión cuando existe conflicto de horario", () => {
    // Error Case: espacio activo pero con conflicto detectado.
    const allowed = canReserveSpot(true, true);

    expect(allowed).toBe(false);
  });
});