import { isValidObjectId } from 'mongoose';
import { ParkingSpot } from '../parking-spots/parking-spot.model';
import { Reservation } from './reservation.model';
import { canReserveSpot, hasTimeConflict, validateExtensionEndTime, validateReservationPeriod } from './reservation.rules';

export class ReservationError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export async function getReservations() {
  return Reservation.find().populate('parkingSpotId', 'number').sort({ startTime: -1 });
}

export async function createReservation(input: {
  parkingSpotId: unknown;
  startTime: unknown;
  endTime: unknown;
}) {
  if (typeof input.parkingSpotId !== 'string' || !isValidObjectId(input.parkingSpotId)) {
    throw new ReservationError(400, 'Invalid parking spot ID');
  }

  const period = validateReservationPeriod(input.startTime, input.endTime);
  if (!period) {
    throw new ReservationError(400, 'Start time must be before end time');
  }

  const spot = await ParkingSpot.findById(input.parkingSpotId);
  if (!spot) {
    throw new ReservationError(404, 'Parking spot not found');
  }

  if (!spot.active) {
    throw new ReservationError(409, 'Parking spot is not active');
  }

  const overlappingReservations = await Reservation.find({
    parkingSpotId: spot._id,
    status: 'ACTIVE',
    startTime: { $lt: period.end },
    endTime: { $gt: period.start }
  });

  const hasConflict = overlappingReservations.some((reservation) =>
    hasTimeConflict(period.start, period.end, reservation.startTime, reservation.endTime)
  );

  if (!canReserveSpot(spot.active, hasConflict)) {
    throw new ReservationError(409, 'Parking spot is not available for this time range');
  }

  return Reservation.create({
    parkingSpotId: spot._id,
    startTime: period.start,
    endTime: period.end,
    status: 'ACTIVE'
  });
}

export async function cancelReservation(id: string) {
  if (!isValidObjectId(id)) {
    return null;
  }

  return Reservation.findByIdAndUpdate(id, { status: 'CANCELLED' }, { new: true });
}

export async function extendReservation(id: string, endTime: unknown) {

  if (!isValidObjectId(id)){
    throw new ReservationError(404, 'Reservation not found');
  }

  const reservation = await Reservation.findById(id);
  if (!reservation){
    throw new ReservationError(404, 'Reservation not found');
  }

  const now = new Date();

  if (reservation.status !== 'ACTIVE' || reservation.endTime <= now){
    throw new ReservationError(409, 'Only active and unexpired reservations can be extended');
  }

  const validNewEnd = validateExtensionEndTime(reservation.endTime, endTime, now);
  if (!validNewEnd){
    throw new ReservationError(
      400,
      'New end time must be a valid date strictly after the current end time'
    );
  }

  const conflictingReservations = await Reservation.find({
    _id: { $ne: reservation._id },
    parkingSpotId: reservation.parkingSpotId,
    status: 'ACTIVE',
    startTime: { $lt: validNewEnd },
    endTime: { $gt: reservation.endTime }
  });

  const hasConflict = conflictingReservations.some((other) =>
    hasTimeConflict(reservation.endTime, validNewEnd, other.startTime, other.endTime)
  );

  if (hasConflict) {
    throw new ReservationError(409, 'Cannot extend reservation due to a schedule conflict');
  }

  reservation.endTime = validNewEnd;
  await reservation.save();

  return reservation;
}
