import { describe, expect, it } from 'vitest'
import { filterLines, readImportText } from './import-stream.js'

const HEAD = 'Uid,Sid,Key,Time,Value,UpdateTime'
const row = (key, time, value) => `1,xiaomisports_app,${key},${time},"${JSON.stringify(value).replace(/"/g, '""')}",${time}`
const MI = [
  HEAD,
  row('heart_rate', 1700000000, { bpm: 61 }),
  row('weight', 1700000100, { time: 1700000100, weight: 85.2, bmi: 27.5 }),
  row('steps', 1700000200, { steps: 40 }),
  // A Key that only starts with "weight" is not a weigh-in.
  row('weight_goal', 1700000250, { goal: 80 }),
  row('weight', 1700000300, { time: 1700000300, weight: 85.0, bmi: 27.4 }),
].join('\r\n')

describe('readImportText', () => {
  it('keeps the header and the weigh-in rows of a Mi Fitness export', async () => {
    const text = await readImportText(new Blob([MI]))
    const lines = text.split('\n').map(l => l.replace(/\r$/, ''))
    expect(lines[0]).toBe(HEAD)
    expect(lines.slice(1).map(l => l.split(',')[2])).toEqual(['weight', 'weight'])
  })

  it('finds the rows whatever the slice size, even one byte at a time', async () => {
    const whole = await readImportText(new Blob([MI]))
    for (const chunk of [1, 7, 64, 1 << 20]) expect(await readImportText(new Blob([MI]), { chunk })).toBe(whole)
  })

  it('reads any other file whole', async () => {
    const csv = 'Date,Weight (kg)\n2026-09-01,80\n2026-09-02,81'
    expect(await readImportText(new Blob([csv]))).toBe(csv)
  })

  it('joins up a character cut by a slice boundary', async () => {
    const text = 'name\nPrés\nwanted Ünïcødé\nnö'
    expect(await filterLines(new Blob([text]), l => l.startsWith('wanted'), { chunk: 3 })).toBe('name\nwanted Ünïcødé')
  })

  it('keeps a last line that has no line break after it', async () => {
    expect(await filterLines(new Blob(['h\na\nb']), l => l === 'b', { chunk: 2 })).toBe('h\nb')
  })
})
