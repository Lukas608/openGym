import { describe, expect, it } from 'vitest'
import { parseBodyweight, parseImport, mergeImport } from './import-csv.js'
import { parseImportFile } from './import-apps.js'
import { dayOf, timeOf, readingsOf } from './weigh-ins.js'

// Zepp Life data export, BODY/BODY_<n>.csv, as a Mi Body Composition Scale 2 fills it in: the
// scale's weight-only readings (stepping off early, someone else) leave the rest "null".
const HEAD = 'time,weight,height,bmi,fatRate,bodyWaterRate,boneMass,metabolism,muscleRate,visceralFat,impedance'
const ZEPP = [
  HEAD,
  '2024-03-02 06:41:12+0000,81.35,180.0,25.1,19.8,55.4,3.1,1745.0,61.9,9.0,512.0',
  '2024-03-02 18:05:40+0000,82.10,180.0,25.3,null,null,null,null,null,null,null',
  '2024-03-03 06:30:00+0000,81.00,180.0,25.0,19.5,55.6,3.1,1741.0,62.0,9.0,508.0',
  '2024-03-04 06:30:00+0000,0.0,180.0,0.0,null,null,null,null,null,null,null',
].join('\n')

// What the file's UTC instants are where this test runs (CI is UTC, a laptop may not be).
const local = iso => { const ms = Date.parse(iso); return { d: dayOf(ms), at: timeOf(ms) } }

describe('Zepp Life body CSV', () => {
  it('is recognised from the header and reads every weigh-in with its local time', () => {
    const parsed = parseImport(ZEPP, { unit: 'kg' })
    expect(parsed.kind).toBe('bodyweight')
    expect(parsed.source).toBe('Zepp Life')
    expect(parsed.converted).toBe(false)
    expect(parsed.bodyweight.map(b => [b.d, b.at, b.w])).toEqual([
      [local('2024-03-02T06:41:12Z').d, local('2024-03-02T06:41:12Z').at, 81.35],
      [local('2024-03-02T18:05:40Z').d, local('2024-03-02T18:05:40Z').at, 82.1],
      [local('2024-03-03T06:30:00Z').d, local('2024-03-03T06:30:00Z').at, 81],
    ])
  })

  it('goes through the import-file router as well', () => {
    expect(parseImportFile(ZEPP, { unit: 'kg' }).source).toBe('Zepp Life')
  })

  it('turns the body composition into a check-in per day', () => {
    const { measurements } = parseBodyweight(ZEPP, { unit: 'kg' })
    expect(measurements).toHaveLength(2)
    const first = measurements[0]
    expect(first.d).toBe(local('2024-03-02T06:41:12Z').d)
    expect(first.values).toEqual({ bodyFat: 19.8 })
    expect(first.other).toEqual([
      { name: 'Muscle mass', unit: 'kg', value: 61.9 },
      { name: 'Body water', unit: '%', value: 55.4 },
      { name: 'Bone mass', unit: 'kg', value: 3.1 },
      { name: 'Visceral fat', unit: 'none', value: 9 },
      { name: 'BMR (kcal)', unit: 'none', value: 1745 },
      { name: 'BMI', unit: 'none', value: 25.1 },
    ])
  })

  it('keeps the day’s first full reading and fills its gaps from a later one', () => {
    const csv = [HEAD,
      '2024-05-10 12:00:00+0000,80,180,24.7,20.1,null,null,null,null,null,null',
      '2024-05-10 11:00:00+0000,80.2,180,24.8,null,54.9,null,null,null,null,null',
    ].join('\n')
    const [day] = parseBodyweight(csv).measurements
    // 11:00 is the earlier reading, though it comes second in the file.
    expect(day.values).toEqual({ bodyFat: 20.1 })
    expect(day.other.map(o => [o.name, o.value])).toEqual([['Body water', 54.9], ['BMI', 24.8]])
  })

  it('puts a late-evening UTC weigh-in on the local day it happened', () => {
    // 23:30 UTC is already the next day east of Greenwich.
    const csv = `${HEAD}\n2024-06-30 23:30:00+0000,79.9,180,null,null,null,null,null,null,null,null`
    expect(parseBodyweight(csv).bodyweight[0].d).toBe(local('2024-06-30T23:30:00Z').d)
  })

  it('reads the older Mi Fit file with Unix seconds in `timestamp`', () => {
    const ms = Date.UTC(2021, 0, 15, 7, 0)
    const csv = `timestamp,weight,height,bmi,fatRate,bodyWaterRate,boneMass,metabolism,muscleRate,visceralFat,impedance\n${ms / 1000},84.2,180,26,22,52,3,1800,60,11,500`
    const parsed = parseBodyweight(csv)
    expect(parsed.bodyweight).toEqual([{ d: dayOf(ms), at: timeOf(ms), w: 84.2, t: ms }])
    expect(parsed.measurements[0].values.bodyFat).toBe(22)
  })

  it('converts the weights and the mass fields for a profile in pounds', () => {
    const parsed = parseBodyweight(ZEPP, { unit: 'lb' })
    expect(parsed.converted).toBe(true)
    expect(parsed.bodyweight[0].w).toBe(179.35)
    const muscle = parsed.measurements[0].other.find(o => o.name === 'Muscle mass')
    expect(muscle).toEqual({ name: 'Muscle mass', unit: 'lb', value: 136.466 })
  })

  it('a plain time,weight file is not mistaken for Zepp', () => {
    expect(parseBodyweight('time,weight\n2024-03-02 06:41,81').source).not.toBe('Zepp Life')
  })

  it('merges into weigh-ins and measurement fields, and a second import adds nothing', () => {
    const S = { unit: 'kg', bodyweight: [], measurements: [], customMeasurements: [], workouts: [], exWeights: {} }
    const parsed = parseImport(ZEPP, { unit: 'kg' })
    const res = mergeImport(S, parsed)
    expect(res).toEqual({ added: 3, skipped: 0, measurements: 2 })
    expect(S.bodyweight.flatMap(readingsOf)).toHaveLength(3)
    expect(S.customMeasurements.map(c => [c.name, c.unit])).toEqual([
      ['Muscle mass', 'kg'], ['Body water', '%'], ['Bone mass', 'kg'], ['Visceral fat', 'none'], ['BMR (kcal)', 'none'], ['BMI', 'none'],
    ])
    expect(S.measurements[0].bodyFat).toBe(19.8)
    const muscleId = S.customMeasurements[0].id
    expect(S.measurements[0].other.find(o => o.id === muscleId).value).toBe(61.9)

    const again = mergeImport(S, parseImport(ZEPP, { unit: 'kg' }))
    expect(again).toEqual({ added: 0, skipped: 3, measurements: 0 })
    expect(S.customMeasurements).toHaveLength(6)
  })
})
