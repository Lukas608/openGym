// Body fat from caliper skinfolds: Jackson & Pollock's equations for body density (men 1978,
// women 1980), turned into a percentage with Siri's (1961). Skinfolds are stored in mm, as built-in
// measurement fields (lib/measurements.js, group "Skinfolds"); the percentage is worked out when it
// is shown, never stored, so it stays apart from the Body fat field a scale or a person fills in.
//
// Seven sites give the 7-site equation. Without all seven, the 3-site one for the person's sex:
// chest, abdominal and thigh for men; triceps, suprailiac and thigh for women. Both need the
// person's sex and age, from About you (lib/strength-level.js sexOf / ageOf); without them there
// is no number rather than a guess. Age is taken in the year of the check-in, so an old reading
// keeps the value it had.

import { sexOf } from './strength-level.js'

export const SKINFOLD_SITES = ['sfChest', 'sfMidaxillary', 'sfTriceps', 'sfSubscapular', 'sfAbdominal', 'sfSuprailiac', 'sfThigh']
export const THREE_SITES = { male: ['sfChest', 'sfAbdominal', 'sfThigh'], female: ['sfTriceps', 'sfSuprailiac', 'sfThigh'] }

// Body density from the sum of skinfolds (mm) and age (years).
const DENSITY = {
  7: {
    male: (s, a) => 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * a,
    female: (s, a) => 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * a,
  },
  3: {
    male: (s, a) => 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * a,
    female: (s, a) => 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * a,
  },
}

/** Siri: percent body fat from body density (g/cm³). */
export const siri = density => 495 / density - 450

// A caliper reads from about 2 mm (skin alone) to about 60 mm before its jaws run out.
const site = v => (Number.isFinite(+v) && +v >= 1 && +v <= 100 ? +v : null)

/** Age in whole years in the year of `d` ("YYYY-MM-DD"), from S.birthYear, or null. */
export function ageOn(S, d) {
  const b = Math.round(Number(S?.birthYear)), y = +String(d || '').slice(0, 4)
  return b >= 1900 && y >= b ? y - b : null
}

/**
 * Body fat for one check-in: `{ fat, sites: 7 | 3, sum }`, the percentage to a tenth, or
 * `{ missing: 'profile' | 'sites' }` when it cannot be worked out, or null for a check-in with no
 * skinfold at all.
 */
export function skinfoldBodyFat(entry, S) {
  const v = Object.fromEntries(SKINFOLD_SITES.map(k => [k, site(entry?.[k])]))
  if (SKINFOLD_SITES.every(k => v[k] == null)) return null
  const sex = sexOf(S), age = ageOn(S, entry?.d)
  if (!sex || age == null) return { missing: 'profile' }
  const used = SKINFOLD_SITES.every(k => v[k] != null) ? SKINFOLD_SITES : THREE_SITES[sex]
  if (!used.every(k => v[k] != null)) return { missing: 'sites' }
  const sum = used.reduce((a, k) => a + v[k], 0)
  const fat = siri(DENSITY[used.length][sex](sum, age))
  // Outside what the equations were fitted on (a typo of 400 mm, say), the number means nothing.
  if (!Number.isFinite(fat) || fat < 2 || fat > 60) return { missing: 'sites' }
  return { fat: Math.round(fat * 10) / 10, sites: used.length, sum: Math.round(sum * 10) / 10 }
}

/** The chart series of skinfold body fat: `{ t, d, y }` per check-in it can be worked out for. */
export function skinfoldFatSeries(S, range = 0, now = Date.now()) {
  const cutoff = range ? now - range * 86400000 : -Infinity
  return (S?.measurements || []).map(entry => {
    const at = new Date(entry.d + 'T12:00:00').getTime()
    const r = at >= cutoff ? skinfoldBodyFat(entry, S) : null
    return r?.fat != null ? { t: at, d: entry.d, y: r.fat } : null
  }).filter(Boolean)
}
