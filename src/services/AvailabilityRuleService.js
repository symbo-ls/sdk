import { BaseService } from './BaseService.js'

// AvailabilityRuleService wraps the main server's /core/availability-rules/*
// routes (Mongo-backed) — "the formalized per-user freebusy" from
// WORKSPACE_DATA_MODEL §6.8, Phase 4. A rule belongs to one `user` (a member);
// the server defaults `user` to the caller on create (A2 — a member manages
// their own availability) and treats it as immutable thereafter. DELETE is a
// tombstone, never a hard delete (A3). Peer service to sdk.bookings /
// sdk.conversations / sdk.recurrences.
//
// NOTE the route mounts at the kebab-case /core/availability-rules; the SDK
// service + dispatcher entity are the camelCase `availabilityRules`.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param — see PartyService for the contract). Reads are
// member-gated; writes require workspace editor.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

// Wall-clock ⇄ UTC conversion for a named IANA timezone (`interval.tz`,
// e.g. "America/New_York"), implemented with `Intl.DateTimeFormat` +
// `Date.UTC` ONLY — never `new Date(y, m, d, h, mi)` or `new
// Date(someLocaleString)`. Both of those parse through the EXECUTING
// MACHINE's own local timezone: on a UTC CI runner that's a no-op (bug
// invisible), but in a real user's browser (almost never UTC) it silently
// shifted every computed instant by the user's own offset — on top of,
// and independent from, whatever `interval.tz` was requested. Verified
// via a fake-system-tz repro before this fix; see the SDK PR history for
// AvailabilityRuleService.

// Offset (ms) of `tz` from UTC at the instant `date`.
const _tzOffsetMs = (date, tz) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, { type, value }) => {
    if (type !== 'literal') acc[type] = Number(value)
    return acc
  }, {})
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

// A wall-clock date/time meant as local time in `tz` -> the UTC instant
// it represents. Single-pass (assumes the DST regime doesn't flip
// between the initial UTC guess and the offset lookup, true except in
// the exact hour of a DST transition — an accepted, standard limitation
// shared by every offset-lookup implementation of this kind).
const _zonedWallClockToUtc = (year, monthIndex, day, hours, minutes, tz) => {
  const guess = Date.UTC(year, monthIndex, day, hours, minutes)
  return new Date(guess - _tzOffsetMs(new Date(guess), tz))
}

// A UTC instant's wall-clock day-of-week/hours/minutes as observed in `tz`.
const _WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const _utcToZonedWallClock = (date, tz) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, { type, value }) => {
    acc[type] = value
    return acc
  }, {})
  return { dow: _WEEKDAY_INDEX[parts.weekday], hours: Number(parts.hour), minutes: Number(parts.minute) }
}

// convert the weekly object to an array of intervals and a timezone.
const _availabilityToIntervals = (availability) => {
  const interval = { timeBlocks: [], tz: availability[0].tz }

  // Anchor on the most recent Sunday (in UTC calendar terms, so this
  // stays independent of the executing machine's local tz too) so
  // `anchor + dow` lands on the right day of the WEEK. `Date`'s 3rd
  // constructor arg is day-of-MONTH, not day-of-week — the original
  // `new Date(2000, 0, dow, ...)` silently mapped dow=0 (Sunday) to
  // `new Date(2000, 0, 0)` = Dec 31 1999 (a Friday), breaking every day
  // mapping. Anchoring on the CURRENT date (instead of a fixed
  // January-2000 placeholder) also keeps DST resolution correct for the
  // current season — a fixed winter reference silently mis-offset summer
  // availability in DST-observing timezones.
  const now = new Date()
  const anchorYear = now.getUTCFullYear()
  const anchorMonth = now.getUTCMonth()
  const anchorDay = now.getUTCDate() - now.getUTCDay()

  for (const timeSpan of availability[0].weekly) {
    const [fromHours, fromMinutes] = timeSpan.from.split(':').map(Number)
    const [toHours, toMinutes] = timeSpan.to.split(':').map(Number)
    const day = anchorDay + timeSpan.dow

    interval.timeBlocks.push({
      from: _zonedWallClockToUtc(anchorYear, anchorMonth, day, fromHours, fromMinutes, interval.tz),
      to: _zonedWallClockToUtc(anchorYear, anchorMonth, day, toHours, toMinutes, interval.tz)
    })
  }
  return interval
}

// return overlapping time of two intervals
const _intersectTwoIntervals = (interval1, interval2) => {
  let returnInterval = {}
  returnInterval.timeBlocks = []
  for (const timeBlock1 of interval1.timeBlocks) {
    for (const timeBlock2 of interval2.timeBlocks) {
      //check if the two timeblocks overlap
      if (timeBlock1.from < timeBlock2.to && timeBlock1.to > timeBlock2.from) {
        //add the overlapping time to the return interval
        returnInterval.timeBlocks.push({
          from: (timeBlock1.from > timeBlock2.from ? timeBlock1.from : timeBlock2.from),
          to: (timeBlock1.to < timeBlock2.to ? timeBlock1.to : timeBlock2.to)
        })
      }
    }
  }
  return returnInterval
}

// convert the interval back to the weekly object.
const _intervalsToAvailability = (interval) => {
  // No overlap at all is a valid outcome of an intersection (not an
  // error) — guard before indexing timeBlocks[0], which would otherwise
  // throw "Cannot read properties of undefined" on a fully-disjoint set
  // of schedules.
  if (!interval.timeBlocks || interval.timeBlocks.length === 0) return []

  const weekly = []
  for (const timeBlock of interval.timeBlocks) {
    // Read the wall-clock day/hour/minute in `interval.tz` directly —
    // NOT via `.getDay()`/`.getHours()`/`.getMinutes()`, which read in
    // the EXECUTING MACHINE's local timezone, not `interval.tz`.
    // `Date.prototype.getDay()` always returns 0-6 (no wrap-around
    // handling needed). Minutes are zero-padded explicitly — `minutes +
    // '00'` silently produced the wrong string for single-digit minutes
    // (e.g. 5 → '500'.slice(0,2) === '50', not '05').
    const from = _utcToZonedWallClock(timeBlock.from, interval.tz)
    const to = _utcToZonedWallClock(timeBlock.to, interval.tz)

    // fill in the weekly object in the same format as the availability list call.
    weekly.push({
      dow: from.dow,
      from: `${from.hours}:${String(from.minutes).padStart(2, '0')}`,
      to: `${to.hours}:${String(to.minutes).padStart(2, '0')}`
    })
  }
  return weekly
}

export class AvailabilityRuleService extends BaseService {
  // GET /core/availability-rules?user=
  list(filter = {}, options = {}) {
    const extra = {}
    if (filter.user) extra.user = filter.user
    const ws = filter.workspaceId || options.workspaceId
    return this._call('availabilityRules.list', `/availability-rules${_qs(ws, extra)}`)
  }

  // Client-side intersection over `list()` — there is no server-side
  // `/availability-rules/intersect` route. When scheduling a meeting this
  // returns all the weekly time ranges where every userID is available.
  // The first userID is assumed to be the person scheduling the meeting;
  // the result is expressed in their timezone.
  async intersect(userIDs, workspaceId) {
    if (!userIDs || userIDs.length === 0) return []

    // Fetch every user's availability concurrently — a sequential
    // await-in-a-for-loop here would serialize N network round trips
    // (5 users == 5x the latency of the slowest single call).
    const availabilities = await Promise.all(
      userIDs.map((userID) => this.list({ user: userID, workspaceId }))
    )

    const intervals = []
    for (const availability of availabilities) {
      // No availability for this user means nothing to intersect. Return
      // `[]` — not `{}` — to match the array shape `intersect` returns on
      // every other path (see _intervalsToAvailability).
      if (!availability || availability.length === 0) {
        return []
      }

      // convert the weekly object to an array of intervals and a timezone.
      intervals.push(_availabilityToIntervals(availability))
    }

    // create a return availability off of the first interval that we'll trim based on all the other intervals.
    let finalInterval = intervals[0]
    for (const interval of intervals.slice(1)) {
      finalInterval = _intersectTwoIntervals(finalInterval, interval)
    }

    // pass the first interval's timezone to the helper function
    finalInterval.tz = intervals[0].tz

    // convert the final interval back to a weekly object the UI can consume
    return _intervalsToAvailability(finalInterval)
  }

  // GET /core/availability-rules/:id
  get(id, { workspaceId } = {}) {
    return this._call(
      'availabilityRules.get',
      `/availability-rules/${encodeURIComponent(id)}${_qs(workspaceId)}`
    )
  }

  // POST /core/availability-rules (editor; `user` defaults to the caller, A2).
  // payload: { user?, weekly?: [{ dow, from, to }], tz?, overrides?, source?,
  //            custom?, ... }
  create(payload = {}, { workspaceId } = {}) {
    return this._call('availabilityRules.create', `/availability-rules${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/availability-rules/:id (editor; `user` immutable, A2).
  update(id, payload = {}, { workspaceId } = {}) {
    return this._call(
      'availabilityRules.update',
      `/availability-rules/${encodeURIComponent(id)}${_qs(workspaceId)}`,
      { method: 'PATCH', body: payload }
    )
  }

  // DELETE /core/availability-rules/:id (editor; tombstone, never hard, A3).
  remove(id, { workspaceId } = {}) {
    return this._call(
      'availabilityRules.remove',
      `/availability-rules/${encodeURIComponent(id)}${_qs(workspaceId)}`,
      { method: 'DELETE' }
    )
  }
}

export const createAvailabilityRuleService = config => new AvailabilityRuleService(config)
