// Reading an import file into text without holding the whole of a huge export in memory.
//
// Mi Fitness's data copy puts every sample the watch or band ever took into one
// hlth_center_fitness_data.csv: half a gigabyte of heart rate, steps and sleep, with the scale's
// weigh-ins (a few hundred kilobytes) somewhere in between. Read whole into one string, that file
// takes down a phone's WebView. So the file is sniffed by its header and, when it is that export,
// read in slices with only the weigh-in rows kept. Each of its rows is one physical line, and the
// first two columns (Uid, Sid) are plain ids, so the Key column can be tested on the raw line.
// Every other file is read whole, as before.

export const MI_FITNESS_HEADER = /^﻿?\s*uid,sid,key,time,value,updatetime\s*$/i
const MI_FITNESS_WEIGHT_ROW = /^[^,\r\n]*,[^,\r\n]*,weight,/

/** Big enough that reading it is worth a word to the person waiting. */
export const LARGE_IMPORT_BYTES = 20 << 20

/** The first line of a file, read from its first few kilobytes. */
async function firstLine(file) {
  const head = await file.slice(0, 4096).text()
  return head.split(/\r?\n/, 1)[0]
}

/**
 * The header line and the lines `keep` accepts, read `chunk` bytes at a time.
 *
 * Lines are cut from the bytes and each decoded on its own. Splitting a decoded chunk instead
 * hands out slices that point into the chunk: every kept line would hold its whole chunk alive,
 * and with weigh-ins spread through the file that is most of the half gigabyte. A newline byte
 * never occurs inside a UTF-8 character, so cutting at it never splits one.
 */
export async function filterLines(file, keep, { chunk = 8 << 20 } = {}) {
  const decoder = new TextDecoder()
  const out = []
  let rest = new Uint8Array(0), header = true
  const take = bytes => {
    const line = decoder.decode(bytes)
    if (header) { out.push(line.replace(/^﻿/, '')); header = false } else if (keep(line)) out.push(line)
  }
  for (let at = 0; at < file.size; at += chunk) {
    let bytes = new Uint8Array(await file.slice(at, at + chunk).arrayBuffer())
    if (rest.length) { const joined = new Uint8Array(rest.length + bytes.length); joined.set(rest); joined.set(bytes, rest.length); bytes = joined }
    let start = 0
    for (let nl = bytes.indexOf(10); nl >= 0; nl = bytes.indexOf(10, start)) {
      take(bytes.subarray(start, nl))
      start = nl + 1
    }
    rest = bytes.slice(start)
  }
  if (rest.length) take(rest)
  return out.join('\n')
}

/** The text an import should parse: the weigh-ins only for a Mi Fitness export, else all of it. */
export async function readImportText(file, opts) {
  if (MI_FITNESS_HEADER.test(await firstLine(file))) return filterLines(file, line => MI_FITNESS_WEIGHT_ROW.test(line), opts)
  return file.text()
}
