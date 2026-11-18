import { describe, expect, it } from 'vitest'
import { bodyCSV } from './export-csv.js'
import { parseImport, mergeImport } from './import-csv.js'
import {
  MEASUREMENT_FIELDS, DEFAULT_MEASUREMENT_KEYS, builtinCsvColumn, fromMeasurementDisplay,
  measurementSeries, measurementUnit, normalizeMeasurementsState, toMeasurementDisplay,
} from './measurements.js'

const thigh = MEASUREMENT_FIELDS.find(f => f.key === 'sfThigh')
const waist = MEASUREMENT_FIELDS.find(f => f.key === 'waist')

describe('skinfold fields', () => {
  it('are optional, in a group of their own, and in mm whatever the profile’s unit', () => {
    const sites = MEASUREMENT_FIELDS.filter(f => f.group === 'Skinfolds')
    expect(sites).toHaveLength(7)
    expect(sites.some(f => DEFAULT_MEASUREMENT_KEYS.includes(f.key))).toBe(false)
    expect(measurementUnit('kg', thigh)).toBe('mm')
    expect(measurementUnit('lb', thigh)).toBe('mm')
    // A circumference still follows the profile.
    expect(measurementUnit('lb', waist)).toBe('in')
  })

  it('a profile in lb neither converts a skinfold to inches nor back', () => {
    expect(toMeasurementDisplay(12.5, 'lb', thigh)).toBe(12.5)
    expect(fromMeasurementDisplay(12.5, 'lb', thigh)).toBe(12.5)
  })

  it('keep a tenth of a mm, and drop a reading that is not one', () => {
    const S = normalizeMeasurementsState({ measurements: [{ d: '2026-11-01', sfThigh: 12.34, sfChest: -3, sfTriceps: 'x' }] })
    expect(S.measurements[0]).toMatchObject({ sfThigh: 12.3, sfChest: null, sfTriceps: null })
  })

  it('chart in mm for a profile in lb', () => {
    const S = normalizeMeasurementsState({ unit: 'lb', measurements: [{ d: '2026-11-01', sfThigh: 14 }] })
    expect(measurementSeries(S, 'sfThigh').map(p => p.y)).toEqual([14])
  })

  it('travel through the body CSV in mm, both ways', () => {
    expect(builtinCsvColumn(thigh)).toBe('thigh_skinfold_mm')
    const S = normalizeMeasurementsState({ unit: 'lb', bodyweight: [], measurements: [{ d: '2026-11-01', sfThigh: 14, sfChest: 9.5, waist: 84 }] })
    const csv = bodyCSV(S)
    // (The file starts with a BOM, so a spreadsheet reads it as UTF-8.)
    expect(csv.replace(/^﻿/, '').split(/\r?\n/)[0]).toBe('date,weight_lb,waist_cm,chest_skinfold_mm,thigh_skinfold_mm')
    const fresh = { unit: 'lb', bodyweight: [], measurements: [], customMeasurements: [], workouts: [], exWeights: {} }
    expect(mergeImport(fresh, parseImport(csv, { unit: 'lb' })).measurements).toBe(1)
    expect(fresh.measurements[0]).toMatchObject({ sfThigh: 14, sfChest: 9.5, waist: 84 })
  })
})
