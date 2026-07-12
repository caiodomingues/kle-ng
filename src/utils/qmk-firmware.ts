/**
 * QMK firmware generator.
 *
 * Turns a matrix-annotated layout (VIA "row,col" labels in labels[0], rotary
 * encoders marked with sm === 'rot_ec11') plus an MCU preset into a complete
 * QMK keyboard folder: keyboard.json, default/via keymaps and a readme.
 *
 * All functions are pure; the UI store handles zipping and download.
 */

import type { Key } from '@adamws/kle-serial'
import type {
  FirmwareAnalysis,
  FirmwareFile,
  FirmwareKey,
  FirmwareSettings,
  McuPreset,
} from '@/types/firmware'
import { formatQmkJson } from './qmk-export'

const matrixLabelPattern = /^(\d+),(\d+)$/

/** Round to 6 decimal places to remove floating-point noise from kle-serial arithmetic. */
function rd(v: number): number {
  return parseFloat(v.toFixed(6))
}

/**
 * Analyze layout keys for firmware generation.
 *
 * Keeps only non-decal, non-ghost keys with a valid "row,col" label. Duplicate
 * matrix positions keep the first occurrence (visual order) and produce a warning.
 */
export function analyzeKeysForFirmware(keys: Key[]): FirmwareAnalysis {
  const warnings: string[] = []

  const annotated: FirmwareKey[] = []
  let skipped = 0
  for (const key of keys) {
    if (key.decal || key.ghost) continue
    const match = (key.labels[0] ?? '').trim().match(matrixLabelPattern)
    if (!match) {
      skipped++
      continue
    }
    annotated.push({
      row: parseInt(match[1]!, 10),
      col: parseInt(match[2]!, 10),
      x: rd(key.x),
      y: rd(key.y),
      w: rd(key.width),
      h: rd(key.height),
      isEncoder: key.sm === 'rot_ec11',
    })
  }
  if (skipped > 0) {
    warnings.push(`${skipped} key(s) without matrix coordinates were skipped`)
  }

  // Visual order: top-to-bottom, then left-to-right
  annotated.sort((a, b) => a.y - b.y || a.x - b.x)

  const seen = new Set<string>()
  const unique: FirmwareKey[] = []
  for (const key of annotated) {
    const id = `${key.row},${key.col}`
    if (seen.has(id)) {
      warnings.push(`Duplicate matrix position ${id} ignored (first occurrence kept)`)
      continue
    }
    seen.add(id)
    unique.push(key)
  }

  const rowCount = unique.length > 0 ? Math.max(...unique.map((k) => k.row)) + 1 : 0
  const colCount = unique.length > 0 ? Math.max(...unique.map((k) => k.col)) + 1 : 0

  return {
    rowCount,
    colCount,
    keys: unique,
    encoders: unique.filter((k) => k.isEncoder),
    warnings,
  }
}

/**
 * Auto-assign MCU pins: columns first, then rows, then one A/B pair per encoder.
 * Returns null when the preset does not have enough pins.
 */
export function autoAssignPins(
  analysis: FirmwareAnalysis,
  preset: McuPreset,
): Pick<FirmwareSettings, 'rowPins' | 'colPins' | 'encoderPins'> | null {
  const needed = analysis.colCount + analysis.rowCount + analysis.encoders.length * 2
  if (needed > preset.availablePins.length) return null

  const pins = [...preset.availablePins]
  const colPins = pins.splice(0, analysis.colCount)
  const rowPins = pins.splice(0, analysis.rowCount)
  const encoderPins: [string, string][] = analysis.encoders.map(
    () => [pins.shift()!, pins.shift()!] as [string, string],
  )
  return { rowPins, colPins, encoderPins }
}

/**
 * Validate settings against the analysis. Returns a list of problems (empty = valid).
 */
export function validateFirmwareSettings(
  analysis: FirmwareAnalysis,
  settings: FirmwareSettings,
  preset: McuPreset | undefined,
): string[] {
  const problems: string[] = []
  if (analysis.keys.length === 0) {
    problems.push('Layout has no keys with matrix coordinates')
    return problems
  }
  if (!preset) {
    problems.push('Unknown MCU preset')
    return problems
  }
  if (settings.rowPins.length !== analysis.rowCount) {
    problems.push(`Expected ${analysis.rowCount} row pin(s), got ${settings.rowPins.length}`)
  }
  if (settings.colPins.length !== analysis.colCount) {
    problems.push(`Expected ${analysis.colCount} column pin(s), got ${settings.colPins.length}`)
  }
  if (settings.encoderPins.length !== analysis.encoders.length) {
    problems.push(
      `Expected ${analysis.encoders.length} encoder pin pair(s), got ${settings.encoderPins.length}`,
    )
  }

  const used = [...settings.rowPins, ...settings.colPins, ...settings.encoderPins.flat()]
  const invalid = used.filter((p) => !preset.availablePins.includes(p))
  if (invalid.length > 0) {
    problems.push(`Pin(s) not available on ${preset.name}: ${[...new Set(invalid)].join(', ')}`)
  }
  const duplicates = used.filter((p, i) => used.indexOf(p) !== i)
  if (duplicates.length > 0) {
    problems.push(`Pin(s) assigned more than once: ${[...new Set(duplicates)].join(', ')}`)
  }

  for (const id of [settings.vendorId, settings.productId]) {
    if (!/^0x[0-9A-Fa-f]{4}$/.test(id)) {
      problems.push(`Invalid USB id "${id}" (expected 0xNNNN hex format)`)
    }
  }
  if (!/^[a-z0-9_]+$/.test(sanitizeKeyboardDirName(settings.keyboardDir))) {
    problems.push('Keyboard folder name must contain at least one letter or digit')
  }
  return problems
}

/** Sanitize a layout/keyboard name into a QMK keyboard directory name. */
export function sanitizeKeyboardDirName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Default keycodes: digits, then letters, then KC_TRNS. Encoder pushes get KC_MUTE. */
function defaultKeycode(key: FirmwareKey, index: number): string {
  if (key.isEncoder) return 'KC_MUTE'
  const pool = [
    ...'1234567890'.split('').map((c) => `KC_${c}`),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `KC_${c}`),
  ]
  return pool[index] ?? 'KC_TRNS'
}

function generateKeyboardJson(
  analysis: FirmwareAnalysis,
  settings: FirmwareSettings,
  preset: McuPreset,
  keyboardName: string,
): string {
  const layout = analysis.keys.map((key) => {
    const entry: Record<string, unknown> = { matrix: [key.row, key.col], x: key.x, y: key.y }
    if (key.w !== 1) entry.w = key.w
    if (key.h !== 1) entry.h = key.h
    return entry
  })

  const config: Record<string, unknown> = {
    keyboard_name: keyboardName,
    manufacturer: settings.manufacturer,
    maintainer: settings.maintainer,
    usb: {
      vid: settings.vendorId,
      pid: settings.productId,
      device_version: '1.0.0',
    },
    processor: preset.processor,
    bootloader: preset.bootloader,
    diode_direction: 'COL2ROW',
    features: {
      bootmagic: true,
      extrakey: true,
      mousekey: true,
      nkro: true,
      ...(analysis.encoders.length > 0 ? { encoder: true } : {}),
    },
    matrix_pins: {
      rows: settings.rowPins,
      cols: settings.colPins,
    },
    ...(analysis.encoders.length > 0
      ? {
          encoder: {
            rotary: settings.encoderPins.map(([pinA, pinB]) => ({ pin_a: pinA, pin_b: pinB })),
          },
        }
      : {}),
    layouts: {
      LAYOUT: { layout },
    },
  }

  return formatQmkJson(config) + '\n'
}

function generateKeymapC(analysis: FirmwareAnalysis): string {
  // Group keycodes by visual row (same rounded y) for readable formatting.
  const lines: string[] = []
  let currentY: number | null = null
  let currentLine: string[] = []
  const flush = () => {
    if (currentLine.length > 0) lines.push(`        ${currentLine.join(', ')}`)
    currentLine = []
  }
  analysis.keys.forEach((key, index) => {
    const y = Math.round(key.y * 4) / 4
    if (currentY !== null && y !== currentY) flush()
    currentY = y
    currentLine.push(defaultKeycode(key, index))
  })
  flush()

  const encoderMap =
    analysis.encoders.length > 0
      ? `
#if defined(ENCODER_MAP_ENABLE)
const uint16_t PROGMEM encoder_map[][NUM_ENCODERS][NUM_DIRECTIONS] = {
    [0] = { ${analysis.encoders.map(() => 'ENCODER_CCW_CW(KC_VOLD, KC_VOLU)').join(', ')} },
};
#endif
`
      : ''

  return `// Generated by kle-ng QMK firmware generator
#include QMK_KEYBOARD_H

const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
    [0] = LAYOUT(
${lines.join(',\n')}
    ),
};
${encoderMap}`
}

function generateReadme(keyboardName: string, keyboardDir: string, viaSupport: boolean): string {
  return `# ${keyboardName}

QMK firmware generated by [kle-ng](https://editor.keyboard-tools.xyz).

## Build

Copy this folder into your [qmk_firmware](https://github.com/qmk/qmk_firmware) checkout
as \`keyboards/${keyboardDir}\`, then run:

\`\`\`
qmk compile -kb ${keyboardDir} -km default
${viaSupport ? `qmk compile -kb ${keyboardDir} -km via\n` : ''}\`\`\`

## Flash

\`\`\`
qmk flash -kb ${keyboardDir} -km ${viaSupport ? 'via' : 'default'}
\`\`\`

For RP2040 boards, hold BOOTSEL while plugging in USB and copy the generated
\`.uf2\` file to the RPI-RP2 drive.
`
}

/**
 * Generate the complete set of firmware files for a layout.
 *
 * @throws Error when settings are invalid for the analyzed layout
 */
export function generateFirmwareFiles(
  keys: Key[],
  meta: { name?: string; author?: string },
  settings: FirmwareSettings,
  preset: McuPreset,
): FirmwareFile[] {
  const analysis = analyzeKeysForFirmware(keys)
  const problems = validateFirmwareSettings(analysis, settings, preset)
  if (problems.length > 0) {
    throw new Error(`Cannot generate firmware: ${problems.join('; ')}`)
  }

  const keyboardName = meta.name?.trim() || 'keyboard'
  const keyboardDir = sanitizeKeyboardDirName(settings.keyboardDir || keyboardName) || 'keyboard'

  const files: FirmwareFile[] = [
    {
      path: 'keyboard.json',
      content: generateKeyboardJson(analysis, settings, preset, keyboardName),
    },
    { path: 'readme.md', content: generateReadme(keyboardName, keyboardDir, settings.viaSupport) },
    { path: 'keymaps/default/keymap.c', content: generateKeymapC(analysis) },
  ]

  if (analysis.encoders.length > 0) {
    files.push({ path: 'keymaps/default/rules.mk', content: 'ENCODER_MAP_ENABLE = yes\n' })
  }

  if (settings.viaSupport) {
    files.push({ path: 'keymaps/via/keymap.c', content: generateKeymapC(analysis) })
    files.push({
      path: 'keymaps/via/rules.mk',
      content: `VIA_ENABLE = yes\n${analysis.encoders.length > 0 ? 'ENCODER_MAP_ENABLE = yes\n' : ''}`,
    })
  }

  return files
}
