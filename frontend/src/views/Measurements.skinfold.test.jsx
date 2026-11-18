// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Measurements, { measurementLogSheet } from './Measurements.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { normalizeMeasurementsState } from '../lib/measurements.js'

// Skinfolds in mm, and the body fat worked out from them (lib/skinfold.js) shown live in the
// log form and as a chart of its own, never written into the Body fat field.
const mounted = []
function render(node) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push([root, host])
  act(() => root.render(node))
  return host
}
function topSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  return render(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === text)
const input = (host, name) => [...host.querySelectorAll('.measure-field')].find(el => el.firstElementChild.textContent === name).querySelector('input')
const type = (el, value) => act(() => {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const THREE = ['sfChest', 'sfAbdominal', 'sfThigh']
const install = patch => useStore.setState({ S: normalizeMeasurementsState({ ...structuredClone(DEF), measurementEnabled: THREE, ...patch }), user: null })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  bindUI(useUI)
  useUI.setState({ sheets: [], toast: vi.fn() })
})
afterEach(() => {
  act(() => mounted.splice(0).forEach(([root, host]) => { root.unmount(); host.remove() }))
})

describe('skinfolds in the log form', () => {
  it('are typed in mm for a profile in lb, and the form shows the body fat they give', () => {
    install({ unit: 'lb', sex: 'male', birthYear: new Date().getFullYear() - 30 })
    measurementLogSheet()
    const host = topSheet()
    expect(host.textContent).toContain('mm')
    type(input(host, 'Chest skinfold'), '10')
    type(input(host, 'Abdominal skinfold'), '20')
    // Two of three: it says what is still needed.
    expect(host.textContent).toContain('For body fat, measure all 7 sites, or chest, abdominal and thigh.')
    type(input(host, 'Thigh skinfold'), '15')
    expect(host.textContent).toContain('Body fat from 3 skinfolds: 13.6%')
    act(() => button(host, 'Save').click())
    const saved = useStore.getState().S.measurements[0]
    // Stored as typed, not taken for inches, and the Body fat field is left alone.
    expect(saved).toMatchObject({ sfChest: 10, sfAbdominal: 20, sfThigh: 15, bodyFat: null })
  })

  it('without sex and year of birth, asks for them instead of guessing', () => {
    install({ sex: null, birthYear: null })
    measurementLogSheet()
    const host = topSheet()
    type(input(host, 'Chest skinfold'), '10')
    expect(host.textContent).toContain('Set your sex and year of birth under About you to work out body fat from these.')
  })
})

describe('the skinfold body fat chart', () => {
  it('is one of the measurements to choose once a check-in gives a number', () => {
    install({ sex: 'male', birthYear: 1990, measurements: [{ d: '2026-01-10', sfChest: 10, sfAbdominal: 20, sfThigh: 15 }] })
    const host = render(<MemoryRouter><Measurements /></MemoryRouter>)
    act(() => [...host.querySelectorAll('button')].find(el => el.querySelector('.lrow-t')?.textContent === 'Measurement').click())
    const picker = topSheet()
    expect(button(picker, 'Body fat (skinfolds)')).toBeTruthy()
  })
})
