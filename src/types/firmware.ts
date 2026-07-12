/**
 * Types for the QMK firmware generator.
 */

/**
 * Microcontroller preset with QMK identifiers and pin inventory.
 */
export interface McuPreset {
  id: string
  /** Display name shown in the UI */
  name: string
  /** QMK `processor` value */
  processor: string
  /** QMK `bootloader` value */
  bootloader: string
  /**
   * GPIO names in preferred auto-assignment order.
   * Pins are assigned to columns first, then rows, then encoder A/B pairs.
   */
  availablePins: string[]
}

/**
 * User-configurable firmware generation settings.
 */
export interface FirmwareSettings {
  mcuPresetId: string
  /** QMK keyboard directory name (e.g. "teal_workbench"); derived from layout name when empty */
  keyboardDir: string
  manufacturer: string
  maintainer: string
  /** USB vendor id as hex string (e.g. "0xFEED") */
  vendorId: string
  /** USB product id as hex string (e.g. "0x0001") */
  productId: string
  rowPins: string[]
  colPins: string[]
  /** One [pinA, pinB] pair per rotary encoder in the layout */
  encoderPins: [string, string][]
  viaSupport: boolean
}

/**
 * A single key resolved from the layout for firmware generation.
 */
export interface FirmwareKey {
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
  /** True when the key is a rotary encoder (its matrix position is the push button) */
  isEncoder: boolean
}

/**
 * Result of analyzing a layout for firmware generation.
 */
export interface FirmwareAnalysis {
  rowCount: number
  colCount: number
  /** Unique matrix positions sorted visually (top-to-bottom, left-to-right) */
  keys: FirmwareKey[]
  /** Encoders sorted visually; index maps to encoderPins/encoder_map order */
  encoders: FirmwareKey[]
  /** Non-fatal issues found during analysis (shown in the UI) */
  warnings: string[]
}

/**
 * A generated firmware file (path is relative to the keyboard directory).
 */
export interface FirmwareFile {
  path: string
  content: string
}
