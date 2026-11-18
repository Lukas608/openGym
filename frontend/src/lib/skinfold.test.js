import { describe, expect, it } from 'vitest'
import { SKINFOLD_SITES, ageOn, siri, skinfoldBodyFat, skinfoldFatSeries } from './skinfold.js'

const S = (sex, birthYear = 1996) => ({ sex, birthYear })
const seven = (mm, d = '2026-11-12') => ({ d, ...Object.fromEntries(SKINFOLD_SITES.map(k => [k, mm])) })

describe('skinfold body fat', () => {
  it('Siri turns density into percent', () => {
    expect(siri(1.1)).toBeCloseTo(0, 6)
    expect(siri(1.0)).toBeCloseTo(45, 6)
  })

  // Worked by hand from the published equations: man, 30, 7 sites summing to 100 mm:
  // D = 1.112 - 0.043499 + 0.0055 - 0.0086478 = 1.0653532; 495 / D - 450 = 14.64 %.
  it('7 sites, a man of 30', () => {
    const r = skinfoldBodyFat(seven(100 / 7), S('male'))
    expect(r).toEqual({ fat: 14.6, sites: 7, sum: 100 })
  })

  // Woman, 30, 7 sites summing to 100 mm: D = 1.097 - 0.046971 + 0.0056 - 0.0038484 = 1.0517806;
  // 495 / D - 450 = 20.63 %.
  it('7 sites, a woman of 30', () => {
    expect(skinfoldBodyFat(seven(100 / 7), S('female')).fat).toBe(20.6)
  })

  // Man, 30, chest 10 + abdominal 20 + thigh 15 = 45 mm:
  // D = 1.10938 - 0.0372015 + 0.00324 - 0.007722 = 1.0676965; 495 / D - 450 = 13.62 %.
  it('3 sites for a man: chest, abdominal, thigh', () => {
    const r = skinfoldBodyFat({ d: '2026-11-12', sfChest: 10, sfAbdominal: 20, sfThigh: 15, sfTriceps: 9 }, S('male'))
    expect(r).toEqual({ fat: 13.6, sites: 3, sum: 45 })
  })

  // Woman, 30, triceps 18 + suprailiac 15 + thigh 25 = 58 mm:
  // D = 1.0994921 - 0.0575882 + 0.0077372 - 0.004176 = 1.0454651; 495 / D - 450 = 23.47 %.
  it('3 sites for a woman: triceps, suprailiac, thigh', () => {
    const r = skinfoldBodyFat({ d: '2026-11-12', sfTriceps: 18, sfSuprailiac: 15, sfThigh: 25 }, S('female'))
    expect(r).toEqual({ fat: 23.5, sites: 3, sum: 58 })
  })

  it('a man’s three sites are not a woman’s', () => {
    expect(skinfoldBodyFat({ d: '2026-11-12', sfChest: 10, sfAbdominal: 20, sfThigh: 15 }, S('female'))).toEqual({ missing: 'sites' })
  })

  it('without sex or year of birth there is no number, only what is missing', () => {
    expect(skinfoldBodyFat(seven(14), {})).toEqual({ missing: 'profile' })
    expect(skinfoldBodyFat(seven(14), { sex: 'male' })).toEqual({ missing: 'profile' })
    expect(skinfoldBodyFat(seven(14), { birthYear: 1990 })).toEqual({ missing: 'profile' })
  })

  it('a check-in with no skinfold is not a skinfold reading', () => {
    expect(skinfoldBodyFat({ d: '2026-11-12', waist: 84 }, S('male'))).toBeNull()
  })

  it('takes the age in the year of the check-in, so an old reading keeps its value', () => {
    expect(ageOn(S('male', 1990), '2020-05-01')).toBe(30)
    expect(skinfoldBodyFat(seven(100 / 7, '2020-05-01'), S('male', 1990)).fat).toBe(14.6)
    expect(ageOn(S('male', 1990), '1980-01-01')).toBeNull()
  })

  it('a reading no caliper could take leaves the result out', () => {
    expect(skinfoldBodyFat({ ...seven(14), sfThigh: 400 }, S('male'))).toEqual({ missing: 'sites' })
  })

  it('charts the check-ins it can work out, in the range asked for', () => {
    const state = { ...S('male'), measurements: [seven(100 / 7, '2026-01-10'), { d: '2026-06-01', waist: 84 }, seven(12, '2026-11-01')] }
    const now = new Date('2026-11-12T12:00:00').getTime()
    expect(skinfoldFatSeries(state, 0, now).map(p => p.d)).toEqual(['2026-01-10', '2026-11-01'])
    expect(skinfoldFatSeries(state, 30, now).map(p => p.d)).toEqual(['2026-11-01'])
  })
})
