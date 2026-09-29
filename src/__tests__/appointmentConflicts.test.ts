import { describe, expect, it } from 'vitest';
import { batchConflicts, describeConflict, findConflict, type Slot } from '@/services/appointments/conflicts';
import { appointmentService } from '@/services/api';

const booked: Slot[] = [
  { id: 'a1', patientId: 'p1', patientName: 'John Anderson', providerId: 'dr1', providerName: 'Dr. Sarah Ahmed', date: '2026-10-01', startTime: '18:00', endTime: '18:30', status: 'Scheduled' },
  { id: 'a2', patientId: 'p2', patientName: 'Noor Anderson', providerId: 'dr2', providerName: 'Dr. James Carter', date: '2026-10-01', startTime: '09:00', endTime: '09:30', status: 'Cancelled' },
];

describe('no double booking', () => {
  it('the same patient cannot be in two places at once — whoever the provider', () => {
    const c = findConflict(booked, { patientId: 'p1', patientName: 'John Anderson', providerId: 'dr2', date: '2026-10-01', startTime: '18:15', durationMinutes: 30 });
    expect(c?.who).toBe('patient');
    expect(describeConflict({ patientName: 'John Anderson', date: '', startTime: '' }, c!)).toMatch(/John Anderson already has an appointment on 1 Oct 2026 at 18:00–18:30/);
  });

  it('the same provider cannot see two patients at once — by id or by name', () => {
    expect(findConflict(booked, { patientId: 'p9', providerId: 'dr1', date: '2026-10-01', startTime: '17:45', durationMinutes: 30 })?.who).toBe('provider');
    expect(findConflict(booked, { patientId: 'p9', providerName: 'dr. sarah ahmed', date: '2026-10-01', startTime: '18:00' })?.who).toBe('provider');
  });

  it('back to back is fine; another day, another patient and provider, a cancelled slot, or the appointment itself are fine', () => {
    expect(findConflict(booked, { patientId: 'p1', providerId: 'dr1', date: '2026-10-01', startTime: '18:30' })).toBeNull();
    expect(findConflict(booked, { patientId: 'p1', providerId: 'dr1', date: '2026-10-02', startTime: '18:00' })).toBeNull();
    expect(findConflict(booked, { patientId: 'p9', providerId: 'dr9', date: '2026-10-01', startTime: '18:00' })).toBeNull();
    expect(findConflict(booked, { patientId: 'p2', providerId: 'dr2', date: '2026-10-01', startTime: '09:00' })).toBeNull();
    expect(findConflict(booked, { id: 'a1', patientId: 'p1', providerId: 'dr1', date: '2026-10-01', startTime: '18:10' })).toBeNull();
  });

  it('a batch is checked against itself too: four patients with one provider at one time', () => {
    const four = ['p3', 'p4', 'p5', 'p6'].map((patientId) => ({ patientId, providerName: 'Dr. James Carter', date: '2026-10-05', startTime: '18:00' }));
    expect(batchConflicts(booked, four)).toHaveLength(3);
    const staggered = four.map((s, i) => ({ ...s, startTime: `${18 + i}:00` }));
    expect(batchConflicts(booked, staggered)).toEqual([]);
  });

  it('the appointment service refuses a double booking whatever path it came by', async () => {
    const [first] = await appointmentService.all();
    const { id, ...copy } = first;
    void id;
    await expect(appointmentService.create({ ...copy, status: 'Scheduled' })).rejects.toThrow(/already/);
  });
});
