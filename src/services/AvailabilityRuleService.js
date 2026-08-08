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

// convert the weekly object to an array of intervals and a timezone.
const _availabilityToIntervals = (availability) => {
  let interval = {}
  interval.timeBlocks = []
  interval.tz = availability[0].tz
  for (const timeSpan of availability[0].weekly) {
    const from = timeSpan.from
    const to = timeSpan.to
    const dow = timeSpan.dow
    let dateFrom = new Date(2000, 0, dow, from.split(":")[0], from.split(":")[1])
    let dateTo = new Date(2000, 0, dow, to.split(":")[0], to.split(":")[1])

    // get a timezone offset to convert to UTC
    const tzOffset = new Date(dateFrom.toLocaleString('en-US', { timeZone: 'UTC' })) - new Date(dateFrom.toLocaleString('en-US', { timeZone: interval.tz }))
    dateFrom = new Date(dateFrom.getTime() + tzOffset)
    dateTo = new Date(dateTo.getTime() + tzOffset)

    interval.timeBlocks.push({
      from: dateFrom,
      to: dateTo
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
  // get a timezone offset to convert from UTC to local time
  const tzOffset = new Date(interval.timeBlocks[0].from.toLocaleString('en-US', { timeZone: 'UTC' })) - new Date(interval.timeBlocks[0].from.toLocaleString('en-US', { timeZone: interval.tz }))

  let weekly = []
  for (const timeBlock of interval.timeBlocks) {
    //convert the time block from UTC to local time
    const dateFrom = new Date(timeBlock.from.getTime() - tzOffset)
    const dateTo = new Date(timeBlock.to.getTime() - tzOffset)

    //handle timezone wrap around
    let adjustedDow = dateFrom.getDay()
    if (adjustedDow < 0) {
      adjustedDow = adjustedDow + 7
    } else if (adjustedDow > 6) {
      adjustedDow = adjustedDow - 7
    }

    //fill in the weekly object in the same format as the availability list call
    weekly.push({
      dow: adjustedDow,
      from: dateFrom.getHours() + ':' + (dateFrom.getMinutes() + '00').slice(0, 2),
      to: dateTo.getHours() + ':' + (dateTo.getMinutes() + '00').slice(0, 2)
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

  // GET /core/availability-rules/intersect
  // when scheduling a meeting this will return all the times that each userID is available. The first userID is assumed to be the person scheduling the meeting and will be in their time zone
  async intersect(userIDs, workspaceId) {
    let intervals = []
    for (const userID of userIDs) {
      let availability = await this.list({
        user: userID,
        workspaceId: workspaceId
      })

      //return empty if no availability is found
      if (!availability || availability.length === 0) {
        return {}
      }

      //convert the weekly object to an array of intervals and a timezone.
      intervals.push(_availabilityToIntervals(availability))
    }

    //create a return availability off of the first interval that we'll trim based on all the other intervals.
    let finalInterval = intervals[0]
    for (const interval of intervals.slice(1)) {
      finalInterval = _intersectTwoIntervals(finalInterval, interval)
    }

    // pass the first interval's timezone to the helper function
    finalInterval.tz = intervals[0].tz

    //convert the final interval back to a weekly object the UI can consume
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
