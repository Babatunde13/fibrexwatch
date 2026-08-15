import type { DeviceDetail, DeviceHistory } from '../types'
import { DeviceAnalytics } from './DeviceAnalytics'

export type DeviceDialogState =
  | { kind: 'loading'; name: string }
  | { kind: 'error'; name: string; message: string }
  | { kind: 'ready'; detail: DeviceDetail; history: DeviceHistory }

export function DeviceDialog({
  state,
  onClose,
}: {
  state: DeviceDialogState
  onClose: () => void
}) {
  const title =
    state.kind === 'ready'
      ? state.detail.device.displayName || state.detail.device.hostname
      : state.name
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="panel device-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="panel-label">Device details</p>
            <h2 id="device-dialog-title">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {state.kind === 'loading' && <div className="dialog-state">Loading device history…</div>}
        {state.kind === 'error' && (
          <div className="notice error">
            <strong>History could not be loaded.</strong>
            <span>{state.message}. Confirm the API was restarted after the latest changes.</span>
          </div>
        )}
        {state.kind === 'ready' && (
          <>
            <dl className="device-facts">
              <div>
                <dt>MAC address</dt>
                <dd>{state.detail.device.macAddress}</dd>
              </div>
              <div>
                <dt>First seen</dt>
                <dd>{new Date(state.detail.device.firstSeenAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>{new Date(state.detail.device.lastSeenAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Known IPs</dt>
                <dd>
                  {state.detail.addresses.map((address) => address.ipAddress).join(', ') || 'None'}
                </dd>
              </div>
              <div>
                <dt>Connection</dt>
                <dd>
                  {state.detail.device.connectionBand}
                  {state.detail.device.ssidName ? ` · ${state.detail.device.ssidName}` : ''}
                </dd>
              </div>
            </dl>
            <DeviceAnalytics
              detail={state.detail}
              history={state.history}
            />
          </>
        )}
      </section>
    </div>
  )
}
