/**
 * The bridge between the assistant and the provider's own schedule (My Appointments). The page registers
 * a controller when it mounts; the runtime only calls these — the same handlers its buttons use.
 */
export type ScheduleView = 'upcoming' | 'today' | 'past' | 'cancelled' | 'all';

export interface ScheduleController {
  setView(view: ScheduleView): void;
  /** Search the list (a patient's name, a reason); "" clears it. */
  setSearch(query: string): void;
  /** Open the cancel / reschedule dialog for one of the provider's appointments; false if it is not theirs or not open to change. */
  openCancel(appointmentId: string): boolean;
  openReschedule(appointmentId: string): boolean;
}

class ScheduleRegistryImpl {
  private controller: ScheduleController | undefined;

  register(controller: ScheduleController): () => void {
    this.controller = controller;
    return () => {
      if (this.controller === controller) this.controller = undefined;
    };
  }

  get(): ScheduleController | undefined {
    return this.controller;
  }
}

export const ScheduleRegistry = new ScheduleRegistryImpl();

/** The same two dialogs on the selected patient's Appointments tab (their appointments, any provider). */
export interface PatientAppointmentsController {
  openCancel(appointmentId: string): boolean;
  openReschedule(appointmentId: string): boolean;
}

class PatientAppointmentsRegistryImpl {
  private controller: PatientAppointmentsController | undefined;

  register(controller: PatientAppointmentsController): () => void {
    this.controller = controller;
    return () => {
      if (this.controller === controller) this.controller = undefined;
    };
  }

  get(): PatientAppointmentsController | undefined {
    return this.controller;
  }
}

export const PatientAppointmentsRegistry = new PatientAppointmentsRegistryImpl();
