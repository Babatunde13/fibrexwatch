import { useState, type FormEvent } from 'react'
import type { Device } from '../types'

type DeviceMetadata = Pick<Device, 'displayName' | 'ownerName' | 'category'>

const deviceCategories = ['Phone', 'Computer', 'TV', 'Tablet', 'Gaming', 'IoT', 'Guest', 'Other']

export function EditDeviceDialog({
  device,
  onClose,
  onSave,
}: {
  device: Device
  onClose: () => void
  onSave: (metadata: DeviceMetadata) => Promise<void>
}) {
  const [displayName, setDisplayName] = useState(device.displayName)
  const [ownerName, setOwnerName] = useState(device.ownerName)
  const [category, setCategory] = useState(device.category)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        displayName: displayName.trim(),
        ownerName: ownerName.trim(),
        category: category.trim(),
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save device')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="panel device-dialog edit-device-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-device-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="panel-label">Device settings</p>
            <h2 id="edit-device-title">
              Edit {device.displayName || device.hostname || device.macAddress}
            </h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="Close device editor"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label className="friendly-name-field">
            Friendly name
            <input
              autoFocus
              maxLength={100}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={device.hostname || 'Living-room TV'}
            />
          </label>
          <label>
            Owner
            <input
              maxLength={100}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="Shared, Babatunde…"
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Uncategorized</option>
              {category && !deviceCategories.includes(category) && (
                <option value={category}>{category}</option>
              )}
              {deviceCategories.map((value) => (
                <option
                  key={value}
                  value={value}
                >
                  {value}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="history-error">{error}</p>}
          <div className="dialog-actions">
            <button
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save device'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
