import type { Device, RouterCapabilities } from '../types'
import { DeviceActions } from './DeviceActions'

type Props = {
  devices: Device[]
  capabilities: RouterCapabilities | null
  onHistory: (device: Device) => void
  onEdit: (device: Device) => void
  onArchive: (device: Device) => void
  onRestore: (device: Device) => void
  onDelete: (device: Device) => void
  onBlock: (device: Device) => void
}

export function DeviceCards({ devices, capabilities, ...actions }: Props) {
  return (
    <div className="device-card-list">
      {devices.map((device) => (
        <article
          className="device-card"
          key={device.id}
        >
          <header>
            <div>
              <strong>{device.displayName || device.hostname || 'Unknown device'}</strong>
              <small>{device.macAddress}</small>
            </div>
            <span className={`device-status ${device.online && !device.blockedAt ? 'online' : ''}`}>
              {deviceStatus(device)}
            </span>
          </header>
          <dl>
            <div>
              <dt>IP address</dt>
              <dd>{device.ipAddress || '—'}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>
                {device.connectionBand}
                {device.ssidName ? ` · ${device.ssidName}` : ''}
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{device.ownerName || 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{device.category || 'Uncategorized'}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{new Date(device.lastSeenAt).toLocaleString()}</dd>
            </div>
          </dl>
          <DeviceActions
            device={device}
            capabilities={capabilities}
            {...actions}
          />
        </article>
      ))}
    </div>
  )
}

function deviceStatus(device: Device) {
  if (device.blockedAt) return 'Blocked'
  if (device.blockPending) return 'Block queued'
  return device.online ? 'Online' : 'Offline'
}
