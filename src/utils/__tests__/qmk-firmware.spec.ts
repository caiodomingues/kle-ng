import { describe, it, expect } from 'vitest'
import { Key } from '@adamws/kle-serial'
import {
  analyzeKeysForFirmware,
  autoAssignPins,
  generateFirmwareFiles,
  sanitizeKeyboardDirName,
  validateFirmwareSettings,
} from '../qmk-firmware'
import { getMcuPreset } from '@/data/mcu-presets'
import type { FirmwareSettings } from '@/types/firmware'

function createKey(overrides: Partial<Key> = {}, label = ''): Key {
  const key = new Key()
  Object.assign(key, overrides)
  key.labels[0] = label
  return key
}

/**
 * 2x5 macropad fixture: 9 switches + 1 rotary encoder at matrix 0,4.
 * Mirrors the Teal-Workbench V1 layout.
 */
function macropadKeys(): Key[] {
  const keys: Key[] = []
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 0 && col === 4) continue
      keys.push(createKey({ x: col, y: row }, `${row},${col}`))
    }
  }
  keys.push(createKey({ x: 4, y: 0, sm: 'rot_ec11' }, '0,4'))
  return keys
}

function validSettings(): FirmwareSettings {
  return {
    mcuPresetId: 'pi-pico',
    keyboardDir: 'teal_workbench',
    manufacturer: 'BluePaper',
    maintainer: 'caiodomingues',
    vendorId: '0xFEED',
    productId: '0x0001',
    rowPins: ['GP7', 'GP8'],
    colPins: ['GP2', 'GP3', 'GP4', 'GP5', 'GP6'],
    encoderPins: [['GP9', 'GP10']],
    viaSupport: true,
  }
}

describe('analyzeKeysForFirmware', () => {
  it('detects matrix dimensions and encoder from macropad layout', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    expect(analysis.rowCount).toBe(2)
    expect(analysis.colCount).toBe(5)
    expect(analysis.keys).toHaveLength(10)
    expect(analysis.encoders).toHaveLength(1)
    expect(analysis.encoders[0]).toMatchObject({ row: 0, col: 4, isEncoder: true })
    expect(analysis.warnings).toHaveLength(0)
  })

  it('sorts keys visually (top-to-bottom, left-to-right)', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    const positions = analysis.keys.map((k) => `${k.row},${k.col}`)
    expect(positions).toEqual([
      '0,0', '0,1', '0,2', '0,3', '0,4',
      '1,0', '1,1', '1,2', '1,3', '1,4',
    ])
  })

  it('skips keys without matrix labels and warns', () => {
    const keys = [...macropadKeys(), createKey({ x: 6, y: 0 }, 'esc')]
    const analysis = analyzeKeysForFirmware(keys)
    expect(analysis.keys).toHaveLength(10)
    expect(analysis.warnings.some((w) => w.includes('without matrix coordinates'))).toBe(true)
  })

  it('ignores decal and ghost keys silently', () => {
    const keys = [
      ...macropadKeys(),
      createKey({ x: 6, y: 0, decal: true }, '0,0'),
      createKey({ x: 7, y: 0, ghost: true }, '0,1'),
    ]
    const analysis = analyzeKeysForFirmware(keys)
    expect(analysis.keys).toHaveLength(10)
    expect(analysis.warnings).toHaveLength(0)
  })

  it('keeps first occurrence of duplicate matrix positions and warns', () => {
    const keys = [...macropadKeys(), createKey({ x: 6, y: 6 }, '0,0')]
    const analysis = analyzeKeysForFirmware(keys)
    expect(analysis.keys).toHaveLength(10)
    expect(analysis.keys.find((k) => k.row === 0 && k.col === 0)?.y).toBe(0)
    expect(analysis.warnings.some((w) => w.includes('Duplicate matrix position 0,0'))).toBe(true)
  })
})

describe('autoAssignPins', () => {
  it('assigns columns, then rows, then encoder pairs on Pi Pico', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    const pins = autoAssignPins(analysis, getMcuPreset('pi-pico')!)
    expect(pins).toEqual({
      colPins: ['GP2', 'GP3', 'GP4', 'GP5', 'GP6'],
      rowPins: ['GP7', 'GP8'],
      encoderPins: [['GP9', 'GP10']],
    })
  })

  it('returns null when the preset has too few pins', () => {
    const keys: Key[] = []
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 15; col++) {
        keys.push(createKey({ x: col, y: row }, `${row},${col}`))
      }
    }
    const analysis = analyzeKeysForFirmware(keys)
    expect(autoAssignPins(analysis, getMcuPreset('pro-micro')!)).toBeNull()
  })
})

describe('validateFirmwareSettings', () => {
  it('accepts valid settings', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    const problems = validateFirmwareSettings(analysis, validSettings(), getMcuPreset('pi-pico'))
    expect(problems).toEqual([])
  })

  it('rejects wrong pin counts', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    const settings = { ...validSettings(), rowPins: ['GP7'] }
    const problems = validateFirmwareSettings(analysis, settings, getMcuPreset('pi-pico'))
    expect(problems.some((p) => p.includes('row pin'))).toBe(true)
  })

  it('rejects duplicate pins', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    const settings = { ...validSettings(), rowPins: ['GP2', 'GP8'] }
    const problems = validateFirmwareSettings(analysis, settings, getMcuPreset('pi-pico'))
    expect(problems.some((p) => p.includes('more than once'))).toBe(true)
  })

  it('rejects pins not available on the preset', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    const settings = { ...validSettings(), rowPins: ['D3', 'GP8'] }
    const problems = validateFirmwareSettings(analysis, settings, getMcuPreset('pi-pico'))
    expect(problems.some((p) => p.includes('not available'))).toBe(true)
  })

  it('rejects malformed USB ids', () => {
    const analysis = analyzeKeysForFirmware(macropadKeys())
    const settings = { ...validSettings(), vendorId: 'FEED' }
    const problems = validateFirmwareSettings(analysis, settings, getMcuPreset('pi-pico'))
    expect(problems.some((p) => p.includes('Invalid USB id'))).toBe(true)
  })
})

describe('sanitizeKeyboardDirName', () => {
  it('converts names to QMK folder format', () => {
    expect(sanitizeKeyboardDirName('Teal-Workbench V1')).toBe('teal_workbench_v1')
    expect(sanitizeKeyboardDirName('  60% Keyboard!  ')).toBe('60_keyboard')
  })
})

describe('generateFirmwareFiles', () => {
  it('generates a complete keyboard folder with VIA support', () => {
    const files = generateFirmwareFiles(
      macropadKeys(),
      { name: 'Teal Workbench' },
      validSettings(),
      getMcuPreset('pi-pico')!,
    )
    const paths = files.map((f) => f.path)
    expect(paths).toEqual([
      'keyboard.json',
      'readme.md',
      'keymaps/default/keymap.c',
      'keymaps/default/rules.mk',
      'keymaps/via/keymap.c',
      'keymaps/via/rules.mk',
    ])
  })

  it('produces valid keyboard.json with matrix, encoder and layout', () => {
    const files = generateFirmwareFiles(
      macropadKeys(),
      { name: 'Teal Workbench' },
      validSettings(),
      getMcuPreset('pi-pico')!,
    )
    const config = JSON.parse(files.find((f) => f.path === 'keyboard.json')!.content)
    expect(config.keyboard_name).toBe('Teal Workbench')
    expect(config.processor).toBe('RP2040')
    expect(config.bootloader).toBe('rp2040')
    expect(config.diode_direction).toBe('COL2ROW')
    expect(config.matrix_pins).toEqual({
      rows: ['GP7', 'GP8'],
      cols: ['GP2', 'GP3', 'GP4', 'GP5', 'GP6'],
    })
    expect(config.encoder).toEqual({ rotary: [{ pin_a: 'GP9', pin_b: 'GP10' }] })
    expect(config.features.encoder).toBe(true)
    expect(config.layouts.LAYOUT.layout).toHaveLength(10)
    expect(config.layouts.LAYOUT.layout[4]).toEqual({ matrix: [0, 4], x: 4, y: 0 })
  })

  it('generates keymap.c with one keycode per layout key and encoder map', () => {
    const files = generateFirmwareFiles(
      macropadKeys(),
      { name: 'Teal Workbench' },
      validSettings(),
      getMcuPreset('pi-pico')!,
    )
    const keymap = files.find((f) => f.path === 'keymaps/default/keymap.c')!.content
    const layoutArgs = keymap.match(/LAYOUT\(([^)]*)\)/s)?.[1] ?? ''
    expect(layoutArgs.split(',')).toHaveLength(10)
    expect(keymap).toContain('KC_MUTE') // encoder push default
    expect(keymap).toContain('ENCODER_CCW_CW(KC_VOLD, KC_VOLU)')
    expect(keymap).toContain('encoder_map')
  })

  it('omits encoder artifacts for layouts without encoders', () => {
    const keys = macropadKeys().filter((k) => k.sm !== 'rot_ec11')
    const settings = { ...validSettings(), encoderPins: [] as [string, string][] }
    const files = generateFirmwareFiles(
      keys,
      { name: 'Plain Pad' },
      settings,
      getMcuPreset('pi-pico')!,
    )
    const config = JSON.parse(files.find((f) => f.path === 'keyboard.json')!.content)
    expect(config.encoder).toBeUndefined()
    expect(config.features.encoder).toBeUndefined()
    expect(files.some((f) => f.path === 'keymaps/default/rules.mk')).toBe(false)
    const keymap = files.find((f) => f.path === 'keymaps/default/keymap.c')!.content
    expect(keymap).not.toContain('encoder_map')
  })

  it('throws on invalid settings', () => {
    const settings = { ...validSettings(), rowPins: [] }
    expect(() =>
      generateFirmwareFiles(macropadKeys(), {}, settings, getMcuPreset('pi-pico')!),
    ).toThrow(/row pin/)
  })
})
