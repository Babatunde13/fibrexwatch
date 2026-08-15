import { useState } from 'react'
import type { Device } from '../types'

export type DeviceLifecycleAction = 'archive' | 'restore' | 'delete' | 'block'

export function DeviceLifecycleDialog({
  device,
  action,
  onClose,
  onConfirm,
}: {
  device: Device
  action: DeviceLifecycleAction
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const name = device.displayName || device.hostname || device.macAddress
  const copy = lifecycleCopy(action)

  const confirm = async () => {
    setWorking(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${copy.verb} device`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="panel device-dialog lifecycle-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="device-lifecycle-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="panel-label">Device management</p>
        <h2 id="device-lifecycle-title">
          {copy.title} {name}?
        </h2>
        <p>{copy.description}</p>
        {error && <p className="history-error">{error}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            disabled={working}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={action === 'delete' || action === 'block' ? 'danger' : 'primary'}
            type="button"
            disabled={working}
            onClick={() => void confirm()}
          >
            {working ? 'Working…' : copy.confirm}
          </button>
        </div>
      </section>
    </div>
  )
}

function lifecycleCopy(action: DeviceLifecycleAction) {
  if (action === 'block')
    return {
      title: 'Block',
      verb: 'block',
      confirm: 'Block from Wi-Fi',
      description:
        'The local worker will add this MAC address to the Huawei router filter for SSID-1. The device should lose network access and will remain blocked until removed from the router filter.',
    }
  if (action === 'restore')
    return {
      title: 'Restore',
      verb: 'restore',
      confirm: 'Restore device',
      description: 'The device will appear in the active device list again.',
    }
  if (action === 'delete')
    return {
      title: 'Permanently delete',
      verb: 'delete',
      confirm: 'Delete permanently',
      description:
        'This permanently deletes the device, its addresses, readings, and per-device usage history. This cannot be undone.',
    }
  return {
    title: 'Hide',
    verb: 'hide',
    confirm: 'Hide from dashboard',
    description:
      'This only hides the device from the dashboard and preserves its history. It does not disconnect the device from Wi-Fi, and it will automatically return if it reconnects.',
  }
}
