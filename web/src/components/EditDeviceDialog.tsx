import { useState, type FormEvent } from 'react'
import { Alert, Button, Group, Modal, Select, SimpleGrid, TextInput } from '@mantine/core'
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
    <Modal
      opened
      onClose={onClose}
      title={`Edit ${device.displayName || device.hostname || device.macAddress}`}
      centered
      size="md"
    >
      <form
        className="mantine-dialog-form"
        onSubmit={(event) => void submit(event)}
      >
        <TextInput
          label="Friendly name"
          autoFocus
          maxLength={100}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={device.hostname || 'Living-room TV'}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Owner"
            maxLength={100}
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
            placeholder="Shared, Babatunde…"
          />
          <Select
            label="Category"
            value={category || null}
            onChange={(value) => setCategory(value ?? '')}
            data={[
              ...(category && !deviceCategories.includes(category) ? [category] : []),
              ...deviceCategories,
            ]}
            clearable
            placeholder="Uncategorized"
          />
        </SimpleGrid>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            color="dark"
            type="submit"
            loading={saving}
          >
            Save device
          </Button>
        </Group>
      </form>
    </Modal>
  )
}
