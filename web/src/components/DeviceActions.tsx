import { ActionIcon, Menu, Tooltip } from '@mantine/core'
import {
  IconArchive,
  IconBan,
  IconDotsVertical,
  IconEdit,
  IconHistory,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react'
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
        <Menu
          shadow="md"
          width={190}
          position="bottom-end"
        >
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Device actions"
            >
              <IconDotsVertical size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconRestore size={16} />}
              onClick={() => onRestore(device)}
            >
              Restore
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => onDelete(device)}
            >
              Delete forever
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    )
  }

  return (
    <div className="row-actions">
      <Tooltip label="History">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="View device history"
          onClick={() => onHistory(device)}
        >
          <IconHistory size={18} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Edit">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Edit device"
          onClick={() => onEdit(device)}
        >
          <IconEdit size={18} />
        </ActionIcon>
      </Tooltip>
      <Menu
        shadow="md"
        width={190}
        position="bottom-end"
      >
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="More device actions"
          >
            <IconDotsVertical size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {capabilities?.deviceBlocking && !device.blockedAt && (
            <Menu.Item
              color="red"
              leftSection={<IconBan size={16} />}
              disabled={device.blockPending}
              onClick={() => onBlock(device)}
            >
              {device.blockPending ? 'Block queued' : 'Block Wi-Fi'}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<IconArchive size={16} />}
            onClick={() => onArchive(device)}
          >
            Hide device
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}
