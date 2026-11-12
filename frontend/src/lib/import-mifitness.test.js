import { describe, expect, it } from 'vitest'
import { parseBodyweight, parseImport, mergeImport } from './import-csv.js'
import { parseImportFile } from './import-apps.js'
import { readImportText } from './import-stream.js'
import { dayOf, timeOf, readingsOf } from './weigh-ins.js'

// Mi Fitness data copy, hlth_center_fitness_data.csv: every sample of every kind, a weigh-in being a
// row with Key "weight" and the reading as JSON. Made-up numbers in the shape a Mi scale writes; a
// reading the scale took without bare feet (weight only) has its body composition at 0.
const HEAD = 'Uid,Sid,Key,Time,Value,UpdateTime'
const json = v => `"${JSON.stringify(v).replace(/"/g, '""')}"`
const sample = (key, s, v, sid = 'xiaomiwear_app') => `1000,${sid},${key},${s},${json(v)},${s + 60}`
const weigh = (s, v, sid = 'xiaomisports_app') => sample('weight', s, { time: s, ...v }, sid)
const FULL = { weight: 85.2, bmi: 27.5, body_fat_rate: 28.384668, moisture_rate: 49.128117, bone_mass: 3.1083138, basal_metabolism: 1688, muscle_rate: 57.907948, protein_rate: 18.838955, visceral_fat: 12 }
const BARE = { weight: 85.6, bmi: 27.6, body_fat_rate: 0, moisture_rate: 0, bone_mass: 0, basal_metabolism: 0, muscle_rate: 0, protein_rate: 0, visceral_fat: 0 }
const T1 = Date.UTC(2026, 9, 12, 5, 10) / 1000, T2 = Date.UTC(2026, 9, 12, 17, 0) / 1000, T3 = Date.UTC(2026, 9, 13, 4, 48) / 1000
const MI = [
  HEAD,
  sample('heart_rate', T1 - 60, { bpm: 58 }),
  weigh(T1, FULL),
  sample('steps', T1 + 60, { steps: 12 }),
  weigh(T2, BARE, 'xiaomiwear_app_manually'),
  weigh(T3, { ...FULL, weight: 85.0, body_fat_rate: 28.1 }),
].join('\n')
const local = s => ({ d: dayOf(s * 1000), at: timeOf(s * 1000) })

describe('Mi Fitness data copy', () => {
  it('reads the weigh-ins with their local time and leaves every other sample alone', () => {
    const parsed = parseImportFile(MI, { unit: 'kg' })
    expect(parsed.kind).toBe('bodyweight')
    expect(parsed.source).toBe('Mi Fitness')
    expect(parsed.bodyweight.map(b => [b.d, b.at, b.w])).toEqual([
      [local(T1).d, local(T1).at, 85.2], [local(T2).d, local(T2).at, 85.6], [local(T3).d, local(T3).at, 85],
    ])
  })

  it('files the body composition in the same fields as Zepp Life, plus protein', () => {
    const { measurements } = parseBodyweight(MI, { unit: 'kg' })
    // The weight-only reading adds no check-in of its own.
    expect(measurements.map(m => m.d)).toEqual([...new Set([local(T1).d, local(T3).d])])
    expect(measurements[0].values).toEqual({ bodyFat: 28.384668 })
    expect(measurements[0].other.map(o => [o.name, o.unit, o.value])).toEqual([
      ['Muscle mass', 'kg', 57.907948], ['Body water', '%', 49.128117], ['Bone mass', 'kg', 3.1083138],
      ['Visceral fat', 'none', 12], ['BMR (kcal)', 'none', 1688], ['BMI', 'none', 27.5], ['Protein', '%', 18.838955],
    ])
  })

  it('reads the same once streamed down to its weigh-ins', async () => {
    const streamed = await readImportText(new Blob([MI]), { chunk: 16 })
    expect(streamed.split('\n')).toHaveLength(4)
    expect(parseImportFile(streamed, { unit: 'kg' })).toEqual(parseImportFile(MI, { unit: 'kg' }))
  })

  it('a value that is not JSON skips its row, not the file', () => {
    const csv = [HEAD, '1000,xiaomisports_app,weight,1790000000,{broken,1790000060', weigh(T1, FULL)].join('\n')
    expect(parseBodyweight(csv).bodyweight).toHaveLength(1)
  })

  it('does not take the daily summaries file for weigh-ins', () => {
    const agg = `Uid,Sid,Tag,Key,Time,Value,UpdateTime\n1000,xiaomisports_app,daily_report,weight,${T1},${json({ avg: 85 })},${T1}`
    expect(parseImport(agg).source).not.toBe('Mi Fitness')
  })

  it('lands on the same weigh-ins and fields as the Zepp Life export of the same history', () => {
    const S = { unit: 'kg', bodyweight: [], measurements: [], customMeasurements: [], workouts: [], exWeights: {} }
    const zeppTime = s => new Date(s * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+0000')
    const zepp = ['time,weight,height,bmi,fatRate,bodyWaterRate,boneMass,metabolism,muscleRate,visceralFat,impedance',
      `${zeppTime(T1)},85.2,176,27.5,28.384668,49.128117,3.1083138,1688,57.907948,12,500`].join('\n')
    expect(mergeImport(S, parseImport(zepp))).toMatchObject({ added: 1, measurements: 1 })
    const res = mergeImport(S, parseImport(MI))
    // T1 is already here from Zepp Life: only the other two weigh-ins and the other day arrive.
    expect(res).toEqual({ added: 2, skipped: 1, measurements: 1 })
    expect(S.bodyweight.flatMap(readingsOf)).toHaveLength(3)
    expect(S.customMeasurements.map(c => c.name)).toEqual(['Muscle mass', 'Body water', 'Bone mass', 'Visceral fat', 'BMR (kcal)', 'BMI', 'Protein'])
  })
})
