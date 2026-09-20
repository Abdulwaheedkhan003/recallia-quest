import { bookingConfigured, config } from './config.ts'
import { HttpError, log } from './util.ts'

/**
 * Booking provider: HL7 FHIR R4 scheduling (Slot search + Appointment create).
 * Many hospital systems / scheduling platforms expose this standard API.
 * Nothing here ever reports success unless the remote server confirms it.
 */
export const BOOKING_REQUIREMENTS = [
  'FHIR_BASE_URL — base URL of the hospital’s FHIR R4 API supporting Slot search and Appointment create',
  'FHIR_BEARER_TOKEN — access token issued by that provider (if required)',
  'FHIR_PATIENT_IDENTIFIER_SYSTEM — (recommended) the hospital’s MRN identifier system, so users enter their hospital number instead of an internal FHIR id',
  'Each user’s hospital patient number (entered in Settings → Hospital booking)',
]
const APPT_STATUS = process.env.FHIR_APPOINTMENT_STATUS ?? 'booked' // some servers require "proposed" or "pending"
const ID_SYSTEM = process.env.FHIR_PATIENT_IDENTIFIER_SYSTEM ?? ''

/** Resolve the user's hospital number to a FHIR Patient id (via identifier search when configured). */
async function resolvePatient(value: string): Promise<string> {
  if (!ID_SYSTEM) return value
  const b = (await fhir(`Patient?identifier=${encodeURIComponent(`${ID_SYSTEM}|${value}`)}&_count=2`)) as { entry?: { resource: Res }[] }
  const found = (b.entry ?? []).map((e) => e.resource).filter((r) => r.resourceType === 'Patient')
  if (found.length !== 1) throw new HttpError(409, 'PATIENT_NOT_FOUND', 'The hospital could not find exactly one patient with that number. Please check it in Settings.')
  return found[0].id
}

export interface SlotOption { id: string; start: string; end: string; practitioner: string; location: string; service: string }

function assertBooking() {
  if (!bookingConfigured()) throw new HttpError(503, 'BOOKING_NOT_CONFIGURED', 'No hospital booking system is connected yet.', { required: BOOKING_REQUIREMENTS })
}

async function fhir(path: string, init?: RequestInit) {
  const r = await fetch(`${config.booking.fhirBase}/${path}`, {
    ...init,
    headers: {
      accept: 'application/fhir+json',
      ...(init?.body ? { 'content-type': 'application/fhir+json', prefer: 'return=representation' } : {}),
      ...(config.booking.fhirToken ? { authorization: `Bearer ${config.booking.fhirToken}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  }).catch((e: Error) => {
    log.error('fhir network', { err: e.message })
    throw new HttpError(502, 'BOOKING_UNREACHABLE', 'The hospital booking system could not be reached.')
  })
  const body = (await r.json().catch(() => null)) as Record<string, unknown> | null
  if (!r.ok) {
    log.warn('fhir error', { status: r.status, path: path.split('?')[0] })
    throw new HttpError(502, 'BOOKING_REJECTED', 'The hospital booking system returned an error.', { providerStatus: r.status })
  }
  return body ?? {}
}

type Res = { resourceType: string; id: string; [k: string]: unknown }
const display = (x: unknown) => ((x as { display?: string })?.display ?? '')
const codeText = (x: unknown) => {
  const c = (x as { text?: string; coding?: { display?: string }[] }[] | undefined)?.[0]
  return c?.text ?? c?.coding?.[0]?.display ?? ''
}

export async function searchSlots(opts: { from: string; specialty?: string }): Promise<SlotOption[]> {
  assertBooking()
  const params = new URLSearchParams({ status: 'free', start: `ge${opts.from}T00:00:00Z`, _count: '12', _sort: 'start', _include: 'Slot:schedule' })
  if (opts.specialty) params.set('specialty:text', opts.specialty)
  const bundle = (await fhir(`Slot?${params}`)) as { entry?: { resource: Res }[] }
  const res = (bundle.entry ?? []).map((e) => e.resource)
  const schedules = new Map(res.filter((r) => r.resourceType === 'Schedule').map((s) => [`Schedule/${s.id}`, s]))
  return res
    .filter((r) => r.resourceType === 'Slot')
    .map((s) => {
      const sched = schedules.get((s.schedule as { reference?: string })?.reference ?? '')
      const actors = (sched?.actor as unknown[]) ?? []
      return {
        id: s.id,
        start: String(s.start),
        end: String(s.end),
        practitioner: actors.map(display).find((d) => d && !/clinic|hospital|room/i.test(d)) ?? actors.map(display)[0] ?? '',
        location: actors.map(display).find((d) => /clinic|hospital|room|centre|center/i.test(d)) ?? config.booking.providerName,
        service: codeText(s.serviceType) || codeText(s.specialty),
      }
    })
}

export async function bookSlot(slotId: string, patientNumber: string, reason: string) {
  assertBooking()
  const patientId = await resolvePatient(patientNumber)
  const slot = (await fhir(`Slot/${encodeURIComponent(slotId)}`)) as Res
  if (slot.status !== 'free') throw new HttpError(409, 'SLOT_TAKEN', 'That time is no longer available. Please choose another.')
  const created = (await fhir('Appointment', {
    method: 'POST',
    body: JSON.stringify({
      resourceType: 'Appointment',
      status: APPT_STATUS,
      slot: [{ reference: `Slot/${slotId}` }],
      start: slot.start,
      end: slot.end,
      description: reason.slice(0, 200),
      participant: [{ actor: { reference: `Patient/${patientId}` }, status: 'accepted' }],
    }),
  })) as Res
  if (!created?.id) throw new HttpError(502, 'BOOKING_UNCONFIRMED', 'The hospital did not confirm the booking.')
  return { externalId: created.id, status: String(created.status ?? 'unknown'), start: String(created.start ?? slot.start) }
}
