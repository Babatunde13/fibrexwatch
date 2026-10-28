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
    <Modal
      opened
      onClose={onClose}
      title={title || 'Device details'}
      size="lg"
      centered
      classNames={{ content: 'device-dialog', title: 'device-dialog-title' }}
    >
      {state.kind === 'loading' && (
        <Stack
          className="dialog-state"
          align="center"
          justify="center"
        >
          <Loader color="mtn" />
          <Text c="dimmed">Loading device history…</Text>
        </Stack>
      )}
      {state.kind === 'error' && (
        <Alert
          color="red"
          title="History could not be loaded"
          icon={<IconAlertCircle size={18} />}
        >
          {state.message}. Confirm the API was restarted after the latest changes.
        </Alert>
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
    </Modal>
  )
}
import { Alert, Loader, Modal, Stack, Text } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
