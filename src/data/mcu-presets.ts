import type { McuPreset } from '@/types/firmware'

/**
 * MCU presets for the QMK firmware generator.
 *
 * `availablePins` order defines auto-assignment preference (columns, then rows,
 * then encoder A/B pairs). Pins with common alternate functions are listed last
 * so simple boards keep them free (e.g. GP0/GP1 = UART0 on RP2040).
 */
export const MCU_PRESETS: McuPreset[] = [
  {
    id: 'pi-pico',
    name: 'Raspberry Pi Pico',
    processor: 'RP2040',
    bootloader: 'rp2040',
    // GP23-GP25 and GP29 are used internally by the Pico board (SMPS control,
    // VBUS sense, onboard LED, VSYS/3 ADC) and are not exposed on the header.
    availablePins: [
      'GP2', 'GP3', 'GP4', 'GP5', 'GP6', 'GP7', 'GP8', 'GP9', 'GP10', 'GP11',
      'GP12', 'GP13', 'GP14', 'GP15', 'GP16', 'GP17', 'GP18', 'GP19', 'GP20',
      'GP21', 'GP22', 'GP26', 'GP27', 'GP28', 'GP0', 'GP1',
    ],
  },
  {
    id: 'rp2040',
    name: 'RP2040 (bare chip)',
    processor: 'RP2040',
    bootloader: 'rp2040',
    // On a custom PCB every GPIO is available.
    availablePins: [
      'GP2', 'GP3', 'GP4', 'GP5', 'GP6', 'GP7', 'GP8', 'GP9', 'GP10', 'GP11',
      'GP12', 'GP13', 'GP14', 'GP15', 'GP16', 'GP17', 'GP18', 'GP19', 'GP20',
      'GP21', 'GP22', 'GP23', 'GP24', 'GP25', 'GP26', 'GP27', 'GP28', 'GP29',
      'GP0', 'GP1',
    ],
  },
  {
    id: 'pro-micro',
    name: 'Pro Micro (ATmega32U4)',
    processor: 'atmega32u4',
    bootloader: 'caterina',
    // Header pins in physical order (TX0..A3 skipping power pins).
    availablePins: [
      'D3', 'D2', 'D1', 'D0', 'D4', 'C6', 'D7', 'E6', 'B4', 'B5',
      'B6', 'B2', 'B3', 'B1', 'F7', 'F6', 'F5', 'F4',
    ],
  },
]

export function getMcuPreset(id: string): McuPreset | undefined {
  return MCU_PRESETS.find((p) => p.id === id)
}

export const DEFAULT_MCU_PRESET_ID = 'pi-pico'
