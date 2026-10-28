import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Pagination,
  Select,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import {
  IconArrowsSort,
  IconBell,
  IconBellCheck,
  IconDeviceDesktop,
  IconEyeOff,
  IconFilterOff,
  IconSearch,
} from '@tabler/icons-react'
import type { Device, DeviceSort, RouterCapabilities, SortDirection } from '../types'
import { DeviceActions } from './DeviceActions'
import { DeviceCards } from './DeviceCards'

type StatusFilter = 'all' | 'online' | 'offline'
type DeviceView = 'network' | 'archived'
type BandFilter = 'all' | Device['connectionBand']
export type AlertStatus = 'default' | 'granted' | 'denied' | 'unsupported'
type Props = {
  devices: Device[]
  search: string
  alertStatus: AlertStatus
  capabilities: RouterCapabilities | null
  onSearch: (value: string) => void
  onEnableAlerts: () => void
  onHistory: (device: Device) => void
  onEdit: (device: Device) => void
  onArchive: (device: Device) => void
  onRestore: (device: Device) => void
  onDelete: (device: Device) => void
  onBlock: (device: Device) => void
}

export function DeviceListPanel({
  devices,
  search,
  alertStatus,
  capabilities,
  onSearch,
  onEnableAlerts,
  onHistory,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onBlock,
}: Props) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [category, setCategory] = useState('all')
  const [owner, setOwner] = useState('all')
  const [band, setBand] = useState<BandFilter>('all')
  const [view, setView] = useState<DeviceView>('network')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState<DeviceSort>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const activeCount = devices.filter((device) => !device.archivedAt).length
  const archivedCount = devices.length - activeCount
  const categories = useMemo(
    () => [...new Set(devices.map((device) => device.category).filter(Boolean))].sort(),
    [devices],
  )
  const owners = useMemo(
    () => [...new Set(devices.map((device) => device.ownerName).filter(Boolean))].sort(),
    [devices],
  )
  const query = search.trim().toLowerCase()
  const filteredDevices = devices.filter(
    (device) =>
      (status === 'all' || device.online === (status === 'online')) &&
      (view === 'archived' ? device.archivedAt !== null : device.archivedAt === null) &&
      (category === 'all' || device.category === category) &&
      (owner === 'all' || device.ownerName === owner) &&
      (band === 'all' || device.connectionBand === band) &&
      (!query ||
        [
          device.displayName,
          device.hostname,
          device.ipAddress,
          device.macAddress,
          device.category,
          device.ownerName,
        ].some((value) => value.toLowerCase().includes(query))),
  )
  const pageCount = Math.max(1, Math.ceil(filteredDevices.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * pageSize
  const sortedDevices = [...filteredDevices].sort((left, right) =>
    compareDevices(left, right, sortBy, sortDirection),
  )
  const visibleDevices = sortedDevices.slice(pageStart, pageStart + pageSize)
  const clearFilters = () => {
    onSearch('')
    setStatus('all')
    setCategory('all')
    setOwner('all')
    setBand('all')
    setPage(1)
  }
  const alertText = alertDescription(alertStatus)

  return (
    <section className="panel devices-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-label">Network</p>
          <h2>
            Devices{' '}
            <small>
              ({filteredDevices.length}/{devices.length})
            </small>
          </h2>
        </div>
        <Button
          variant="light"
          color={alertStatus === 'granted' ? 'teal' : 'dark'}
          leftSection={
            alertStatus === 'granted' ? <IconBellCheck size={16} /> : <IconBell size={16} />
          }
          disabled={alertStatus === 'granted' || alertStatus === 'unsupported'}
          onClick={onEnableAlerts}
        >
          {alertButtonLabel(alertStatus)}
        </Button>
      </div>
      <Tabs
        className="device-view-tabs"
        value={view}
        onChange={(value) => {
          setView((value ?? 'network') as DeviceView)
          setPage(1)
        }}
      >
        <Tabs.List>
          <Tabs.Tab
            value="network"
            leftSection={<IconDeviceDesktop size={16} />}
          >
            Network{' '}
            <Badge
              size="xs"
              variant="light"
              ml={6}
            >
              {activeCount}
            </Badge>
          </Tabs.Tab>
          <Tabs.Tab
            value="archived"
            leftSection={<IconEyeOff size={16} />}
          >
            Hidden{' '}
            <Badge
              size="xs"
              variant="light"
              color="gray"
              ml={6}
            >
              {archivedCount}
            </Badge>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <div className="device-filters">
        <div className="filter-group device-filter-fields">
          <span className="filter-group-label">Filter devices</span>
          <TextInput
            className="device-search"
            aria-label="Search devices"
            leftSection={<IconSearch size={16} />}
            placeholder="Name, IP, MAC, owner or category"
            value={search}
            onChange={(event) => {
              onSearch(event.target.value)
              setPage(1)
            }}
          />
          <Select
            aria-label="Status"
            value={status}
            data={[
              { value: 'all', label: 'Any status' },
              { value: 'online', label: 'Online' },
              { value: 'offline', label: 'Offline' },
            ]}
            onChange={(value) => {
              setStatus(value ?? 'all')
              setPage(1)
            }}
          />
          <Select
            aria-label="Category"
            value={category}
            data={[
              { value: 'all', label: 'Any category' },
              ...categories.map((value) => ({ value, label: value })),
            ]}
            onChange={(value) => {
              setCategory(value ?? 'all')
              setPage(1)
            }}
          />
          <Select
            aria-label="Connection band"
            value={band}
            data={['all', '2.4 GHz', '5 GHz', 'Ethernet', 'Unknown'].map((value) => ({
              value,
              label: value === 'all' ? 'Any connection' : value,
            }))}
            onChange={(value) => {
              setBand((value ?? 'all') as BandFilter)
              setPage(1)
            }}
          />
          <Select
            aria-label="Owner"
            value={owner}
            data={[
              { value: 'all', label: 'Any owner' },
              ...owners.map((value) => ({ value, label: value })),
            ]}
            onChange={(value) => {
              setOwner(value ?? 'all')
              setPage(1)
            }}
          />
          <Tooltip label="Clear all filters">
            <ActionIcon
              variant="default"
              size={36}
              aria-label="Clear all filters"
              onClick={clearFilters}
            >
              <IconFilterOff size={17} />
            </ActionIcon>
          </Tooltip>
        </div>
        <div className="filter-group device-sort-fields">
          <span className="filter-group-label">Sort results</span>
          <Select
            aria-label="Sort devices by"
            value={sortBy}
            leftSection={<IconArrowsSort size={16} />}
            data={[
              ['name', 'Name'],
              ['status', 'Status'],
              ['lastSeen', 'Last seen'],
              ['firstSeen', 'First seen'],
              ['ipAddress', 'IP address'],
              ['owner', 'Owner'],
              ['category', 'Category'],
              ['ssid', 'SSID'],
            ].map(([value, label]) => ({ value, label }))}
            onChange={(value) => {
              setSortBy((value ?? 'name') as DeviceSort)
              setPage(1)
            }}
          />
          <Button
            variant="default"
            aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
            onClick={() => {
              setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          >
            {sortDirection === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
          </Button>
        </div>
      </div>
      <div className="device-table-wrap">
        <table className="device-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Status</th>
              <th>IP address</th>
              <th>Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleDevices.map((device) => (
              <tr key={device.id}>
                <td>
                  <strong>{device.displayName || device.hostname || 'Unknown device'}</strong>
                  <small>
                    {[device.ownerName, device.category, device.macAddress]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </td>
                <td>
                  <Badge
                    color={deviceStatusColor(device)}
                    variant="light"
                  >
                    {deviceStatus(device)}
                  </Badge>
                </td>
                <td>
                  {device.ipAddress || '—'}
                  <small className="connection-detail">
                    <span className={`band-badge band-${bandClass(device.connectionBand)}`}>
                      {device.connectionBand}
                    </span>
                    {device.ssidName && ` ${device.ssidName}`}
                  </small>
                </td>
                <td>{new Date(device.lastSeenAt).toLocaleString()}</td>
                <td>
                  <DeviceActions
                    device={device}
                    capabilities={capabilities}
                    onHistory={onHistory}
                    onEdit={onEdit}
                    onArchive={onArchive}
                    onRestore={onRestore}
                    onDelete={onDelete}
                    onBlock={onBlock}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DeviceCards
        devices={visibleDevices}
        capabilities={capabilities}
        onHistory={onHistory}
        onEdit={onEdit}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
        onBlock={onBlock}
      />
      {!filteredDevices.length && (
        <div className="device-empty-state">
          <IconDeviceDesktop
            size={34}
            stroke={1.4}
          />
          <Text fw={700}>
            {view === 'archived' && archivedCount === 0
              ? 'No hidden devices'
              : 'No matching devices'}
          </Text>
          <Text
            size="sm"
            c="dimmed"
          >
            {view === 'archived' && archivedCount === 0
              ? 'Devices you hide will appear here.'
              : 'Try clearing one or more filters.'}
          </Text>
        </div>
      )}
      {filteredDevices.length > 0 && (
        <nav
          className="device-pagination"
          aria-label="Device pagination"
        >
          <span>
            Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filteredDevices.length)} of{' '}
            {filteredDevices.length}
          </span>
          <Group gap="sm">
            <Select
              w={76}
              value={pageSize.toString()}
              data={['10', '25', '50']}
              onChange={(value) => {
                setPageSize(Number(value ?? 10))
                setPage(1)
              }}
            />
            <Pagination
              total={pageCount}
              value={currentPage}
              onChange={setPage}
              color="dark"
              size="sm"
            />
          </Group>
        </nav>
      )}
      <p className="alert-help">{alertText}</p>
    </section>
  )
}

function deviceStatus(device: Device) {
  if (device.blockedAt) return 'Blocked'
  if (device.blockPending) return 'Block queued'
  return device.online ? 'Online' : 'Offline'
}

function deviceStatusColor(device: Device) {
  if (device.blockedAt) return 'red'
  return device.online ? 'teal' : 'gray'
}

function bandClass(band: Device['connectionBand']) {
  return band.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
}

function compareDevices(left: Device, right: Device, sortBy: DeviceSort, direction: SortDirection) {
  const leftValue = deviceSortValue(left, sortBy)
  const rightValue = deviceSortValue(right, sortBy)
  const compared = leftValue.localeCompare(rightValue, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  if (compared === 0) return left.id - right.id
  return direction === 'asc' ? compared : -compared
}

function deviceSortValue(device: Device, sortBy: DeviceSort) {
  switch (sortBy) {
    case 'name':
      return device.displayName || device.hostname || device.macAddress
    case 'lastSeen':
      return device.lastSeenAt
    case 'firstSeen':
      return device.firstSeenAt
    case 'status':
      return deviceStatus(device)
    case 'ipAddress':
      return device.ipAddress
    case 'owner':
      return device.ownerName
    case 'category':
      return device.category
    case 'ssid':
      return device.ssidName
  }
}

function alertButtonLabel(status: AlertStatus) {
  switch (status) {
    case 'granted':
      return 'Alerts enabled'
    case 'denied':
      return 'Alerts blocked'
    case 'unsupported':
      return 'Alerts unavailable'
    default:
      return 'Enable alerts'
  }
}

function alertDescription(status: AlertStatus) {
  switch (status) {
    case 'granted':
      return 'Browser alerts are active while this dashboard is open. You’ll be notified when polling detects a device it has not seen before.'
    case 'denied':
      return 'Notifications are blocked for this site. Allow them in your browser’s site settings, then reload the page.'
    case 'unsupported':
      return 'This browser does not support desktop notifications.'
    default:
      return 'Enable alerts to receive a browser notification when a new device is detected.'
  }
}
