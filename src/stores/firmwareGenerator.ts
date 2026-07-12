import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { zipSync, strToU8 } from 'fflate'
import { useKeyboardStore } from './keyboard'
import {
  analyzeKeysForFirmware,
  autoAssignPins,
  generateFirmwareFiles,
  sanitizeKeyboardDirName,
  validateFirmwareSettings,
} from '@/utils/qmk-firmware'
import { DEFAULT_MCU_PRESET_ID, getMcuPreset } from '@/data/mcu-presets'
import type { FirmwareSettings } from '@/types/firmware'

const STORAGE_KEY = 'kle-ng-firmware-settings'

/** Subset of settings persisted to localStorage (pins are layout-specific). */
interface PersistedFirmwareSettings {
  mcuPresetId: string
  manufacturer: string
  maintainer: string
  vendorId: string
  productId: string
  viaSupport: boolean
}

const defaultPersisted: PersistedFirmwareSettings = {
  mcuPresetId: DEFAULT_MCU_PRESET_ID,
  manufacturer: '',
  maintainer: '',
  vendorId: '0xFEED',
  productId: '0x0001',
  viaSupport: true,
}

export const useFirmwareGeneratorStore = defineStore('firmwareGenerator', () => {
  const keyboardStore = useKeyboardStore()

  const settings = ref<FirmwareSettings>({
    ...defaultPersisted,
    keyboardDir: '',
    rowPins: [],
    colPins: [],
    encoderPins: [],
  })

  const analysis = computed(() => analyzeKeysForFirmware(keyboardStore.keys))

  const preset = computed(() => getMcuPreset(settings.value.mcuPresetId))

  /** Re-assign pins automatically from the current preset and matrix shape. */
  function resetPins(): void {
    const p = preset.value
    if (!p) return
    const assigned = autoAssignPins(analysis.value, p)
    if (assigned) {
      settings.value.rowPins = assigned.rowPins
      settings.value.colPins = assigned.colPins
      settings.value.encoderPins = assigned.encoderPins
    } else {
      settings.value.rowPins = []
      settings.value.colPins = []
      settings.value.encoderPins = []
    }
  }

  // Re-assign pins when the preset changes or the matrix shape no longer matches
  // (user overrides within the same shape are preserved).
  watch(
    () => settings.value.mcuPresetId,
    () => resetPins(),
  )
  watch(
    () => [analysis.value.rowCount, analysis.value.colCount, analysis.value.encoders.length],
    ([rows, cols, encoders]) => {
      const s = settings.value
      if (
        s.rowPins.length !== rows ||
        s.colPins.length !== cols ||
        s.encoderPins.length !== encoders
      ) {
        resetPins()
      }
    },
    { immediate: true },
  )

  // Default the keyboard folder name from the layout name (never clobber user edits).
  watch(
    () => keyboardStore.metadata.name,
    (name) => {
      if (!settings.value.keyboardDir) {
        settings.value.keyboardDir = sanitizeKeyboardDirName(name || '') || 'keyboard'
      }
    },
    { immediate: true },
  )

  const problems = computed(() =>
    validateFirmwareSettings(analysis.value, settings.value, preset.value),
  )

  const canGenerate = computed(() => problems.value.length === 0)

  /** Generate the firmware files and download them as a ZIP. */
  function downloadFirmware(): void {
    const p = preset.value
    if (!p || !canGenerate.value) return

    const files = generateFirmwareFiles(
      keyboardStore.keys,
      { name: keyboardStore.metadata.name, author: keyboardStore.metadata.author },
      settings.value,
      p,
    )

    const dir = sanitizeKeyboardDirName(settings.value.keyboardDir) || 'keyboard'
    const zipEntries: Record<string, Uint8Array> = {}
    for (const file of files) {
      zipEntries[`${dir}/${file.path}`] = strToU8(file.content)
    }
    const zipped = zipSync(zipEntries)

    const blob = new Blob([zipped.slice().buffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${dir}-qmk-firmware.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Settings persistence (non-pin settings only)
  function loadSettings(): void {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as Partial<PersistedFirmwareSettings>
      if (typeof parsed !== 'object' || parsed === null) return
      for (const key of Object.keys(defaultPersisted) as (keyof PersistedFirmwareSettings)[]) {
        const value = parsed[key]
        if (value !== undefined && typeof value === typeof defaultPersisted[key]) {
          // @ts-expect-error narrow assignment across the persisted union
          settings.value[key] = value
        }
      }
      if (!getMcuPreset(settings.value.mcuPresetId)) {
        settings.value.mcuPresetId = DEFAULT_MCU_PRESET_ID
      }
    } catch (error) {
      console.warn('Failed to parse saved firmware settings:', error)
    }
  }

  watch(
    settings,
    (value) => {
      const persisted: PersistedFirmwareSettings = {
        mcuPresetId: value.mcuPresetId,
        manufacturer: value.manufacturer,
        maintainer: value.maintainer,
        vendorId: value.vendorId,
        productId: value.productId,
        viaSupport: value.viaSupport,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
    },
    { deep: true },
  )

  loadSettings()

  return {
    settings,
    analysis,
    preset,
    problems,
    canGenerate,
    resetPins,
    downloadFirmware,
  }
})
