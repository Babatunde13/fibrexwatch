import type { Device, RouterCapabilities } from '../types'

export function DeviceActions({
  device,
  capabilities,
  onHistory,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onBlock,
}: {
  device: Device
  capabilities: RouterCapabilities | null
  onHistory: (device: Device) => void
  onEdit: (device: Device) => void
  onArchive: (device: Device) => void
  onRestore: (device: Device) => void
  onDelete: (device: Device) => void
  onBlock: (device: Device) => void
}) {
  if (device.archivedAt) {
    return (
      <div className="row-actions">
        <button
          type="button"
          onClick={() => onRestore(device)}
        >
          Restore
        </button>
        <button
          className="danger-link"
          type="button"
          onClick={() => onDelete(device)}
        >
          Delete forever
        </button>
      </div>
    )
  }

  return (
    <div className="row-actions">
      <button
        type="button"
        onClick={() => onHistory(device)}
      >
        History
      </button>
      <button
        type="button"
        onClick={() => onEdit(device)}
      >
        Edit
      </button>
      {capabilities?.deviceBlocking && !device.blockedAt && (
        <button
          className="danger-link"
          type="button"
          disabled={device.blockPending}
          onClick={() => onBlock(device)}
        >
          {device.blockPending ? 'Block queued' : 'Block Wi-Fi'}
        </button>
      )}
      <button
        type="button"
        onClick={() => onArchive(device)}
      >
        Hide
      </button>
    </div>
  )
}
