<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFirmwareGeneratorStore } from '@/stores/firmwareGenerator'
import { MCU_PRESETS } from '@/data/mcu-presets'
import BiExclamationTriangle from 'bootstrap-icons/icons/exclamation-triangle.svg'
import BiDownload from 'bootstrap-icons/icons/download.svg'
import BiArrowCounterclockwise from 'bootstrap-icons/icons/arrow-counterclockwise.svg'

const firmwareStore = useFirmwareGeneratorStore()
const { settings, analysis, preset, problems, canGenerate } = storeToRefs(firmwareStore)

const hasKeys = computed(() => analysis.value.keys.length > 0)

const matrixSummary = computed(() => {
  const a = analysis.value
  const parts = [
    `${a.rowCount} row${a.rowCount === 1 ? '' : 's'} × ${a.colCount} col${a.colCount === 1 ? '' : 's'}`,
    `${a.keys.length} key${a.keys.length === 1 ? '' : 's'}`,
  ]
  if (a.encoders.length > 0) {
    parts.push(`${a.encoders.length} encoder${a.encoders.length === 1 ? '' : 's'}`)
  }
  return parts.join(', ')
})

const availablePins = computed(() => preset.value?.availablePins ?? [])
</script>

<template>
  <div class="firmware-generator-panel">
    <!-- No matrix annotation warning -->
    <div v-if="!hasKeys" class="alert alert-warning mb-0" role="alert">
      <h5 class="alert-heading"><BiExclamationTriangle /> Matrix Coordinates Required</h5>
      <p class="mb-0">
        Firmware generation needs row/column assignments in VIA label format (e.g.
        <code>0,0</code>). Use <strong>Tools → Add Switch Matrix Coordinates</strong> to annotate
        the layout.
      </p>
    </div>

    <div v-else class="row g-3">
      <!-- Left Column: Settings -->
      <div class="col-lg-6">
        <div class="settings-section">
          <div class="section-title mb-2">Keyboard</div>

          <div class="row g-2 mb-2">
            <div class="col-6">
              <label for="firmwareMcuPreset" class="form-label form-label-sm">MCU</label>
              <select
                id="firmwareMcuPreset"
                v-model="settings.mcuPresetId"
                class="form-select form-select-sm"
                aria-label="Select microcontroller preset"
              >
                <option v-for="option in MCU_PRESETS" :key="option.id" :value="option.id">
                  {{ option.name }}
                </option>
              </select>
            </div>
            <div class="col-6">
              <label for="firmwareKeyboardDir" class="form-label form-label-sm"
                >Keyboard Folder</label
              >
              <input
                id="firmwareKeyboardDir"
                v-model="settings.keyboardDir"
                type="text"
                class="form-control form-control-sm"
                placeholder="my_keyboard"
              />
            </div>
          </div>

          <div class="row g-2 mb-2">
            <div class="col-6">
              <label for="firmwareManufacturer" class="form-label form-label-sm"
                >Manufacturer</label
              >
              <input
                id="firmwareManufacturer"
                v-model="settings.manufacturer"
                type="text"
                class="form-control form-control-sm"
                placeholder="My Brand"
              />
            </div>
            <div class="col-6">
              <label for="firmwareMaintainer" class="form-label form-label-sm">Maintainer</label>
              <input
                id="firmwareMaintainer"
                v-model="settings.maintainer"
                type="text"
                class="form-control form-control-sm"
                placeholder="github_username"
              />
            </div>
          </div>

          <div class="row g-2 mb-2">
            <div class="col-6">
              <label for="firmwareVendorId" class="form-label form-label-sm">USB Vendor ID</label>
              <input
                id="firmwareVendorId"
                v-model="settings.vendorId"
                type="text"
                class="form-control form-control-sm"
                placeholder="0xFEED"
              />
            </div>
            <div class="col-6">
              <label for="firmwareProductId" class="form-label form-label-sm">USB Product ID</label>
              <input
                id="firmwareProductId"
                v-model="settings.productId"
                type="text"
                class="form-control form-control-sm"
                placeholder="0x0001"
              />
            </div>
          </div>

          <div class="form-check mb-2">
            <input
              id="firmwareViaSupport"
              v-model="settings.viaSupport"
              class="form-check-input"
              type="checkbox"
            />
            <label class="form-check-label form-label-sm" for="firmwareViaSupport">
              VIA support (adds <code>via</code> keymap)
            </label>
          </div>
        </div>
      </div>

      <!-- Right Column: Pins -->
      <div class="col-lg-6">
        <div class="settings-section">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="section-title">Pins — {{ matrixSummary }}</div>
            <button
              class="btn btn-outline-secondary btn-sm"
              title="Re-assign pins automatically"
              @click="firmwareStore.resetPins"
            >
              <BiArrowCounterclockwise /> Reset
            </button>
          </div>

          <div class="pin-grid mb-2">
            <div v-for="(_, index) in settings.rowPins" :key="`row-${index}`" class="pin-item">
              <label :for="`firmwareRowPin${index}`" class="form-label form-label-sm"
                >ROW{{ index }}</label
              >
              <select
                :id="`firmwareRowPin${index}`"
                v-model="settings.rowPins[index]"
                class="form-select form-select-sm"
              >
                <option v-for="pin in availablePins" :key="pin" :value="pin">{{ pin }}</option>
              </select>
            </div>
            <div v-for="(_, index) in settings.colPins" :key="`col-${index}`" class="pin-item">
              <label :for="`firmwareColPin${index}`" class="form-label form-label-sm"
                >COL{{ index }}</label
              >
              <select
                :id="`firmwareColPin${index}`"
                v-model="settings.colPins[index]"
                class="form-select form-select-sm"
              >
                <option v-for="pin in availablePins" :key="pin" :value="pin">{{ pin }}</option>
              </select>
            </div>
            <template v-for="(pair, index) in settings.encoderPins" :key="`enc-${index}`">
              <div class="pin-item">
                <label :for="`firmwareEncA${index}`" class="form-label form-label-sm"
                  >ENC{{ index }} A</label
                >
                <select
                  :id="`firmwareEncA${index}`"
                  v-model="pair[0]"
                  class="form-select form-select-sm"
                >
                  <option v-for="pin in availablePins" :key="pin" :value="pin">{{ pin }}</option>
                </select>
              </div>
              <div class="pin-item">
                <label :for="`firmwareEncB${index}`" class="form-label form-label-sm"
                  >ENC{{ index }} B</label
                >
                <select
                  :id="`firmwareEncB${index}`"
                  v-model="pair[1]"
                  class="form-select form-select-sm"
                >
                  <option v-for="pin in availablePins" :key="pin" :value="pin">{{ pin }}</option>
                </select>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Bottom: warnings and download -->
      <div class="col-12">
        <div v-if="analysis.warnings.length > 0" class="alert alert-warning py-2 small mb-2">
          <div v-for="warning in analysis.warnings" :key="warning">{{ warning }}</div>
        </div>
        <div v-if="problems.length > 0" class="alert alert-danger py-2 small mb-2">
          <div v-for="problem in problems" :key="problem">{{ problem }}</div>
        </div>
        <button
          class="btn btn-success"
          :disabled="!canGenerate"
          data-testid="firmware-download-button"
          @click="firmwareStore.downloadFirmware"
        >
          <BiDownload /> Download QMK Firmware (ZIP)
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.firmware-generator-panel {
  padding: 1rem;
}

.form-label-sm {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.settings-section {
  padding-top: 0;
  padding-bottom: 0.5rem;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--bs-emphasis-color);
}

.pin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: 0.5rem;
}

.pin-item .form-label {
  display: block;
}
</style>
