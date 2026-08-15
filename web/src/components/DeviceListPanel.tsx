import { useMemo, useState } from 'react'
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
        <button
          type="button"
          disabled={alertStatus === 'granted' || alertStatus === 'unsupported'}
          onClick={onEnableAlerts}
        >
          {alertButtonLabel(alertStatus)}
        </button>
      </div>
      <div
        className="device-view-tabs"
        role="tablist"
        aria-label="Device lists"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'network'}
          onClick={() => {
            setView('network')
            setPage(1)
          }}
        >
          Network devices <span>{activeCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archived'}
          onClick={() => {
            setView('archived')
            setPage(1)
          }}
        >
          Hidden devices <span>{archivedCount}</span>
        </button>
      </div>
      <div className="device-filters">
        <div className="filter-group device-filter-fields">
          <span className="filter-group-label">Filter devices</span>
          <input
            aria-label="Search devices"
            placeholder="Name, IP, MAC, owner or category"
            value={search}
            onChange={(event) => {
              onSearch(event.target.value)
              setPage(1)
            }}
          />
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter)
              setPage(1)
            }}
          >
            <option value="all">Any status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <select
            aria-label="Category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">Any category</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Connection band"
            value={band}
            onChange={(event) => {
              setBand(event.target.value as BandFilter)
              setPage(1)
            }}
          >
            <option value="all">Any connection</option>
            <option value="2.4 GHz">2.4 GHz</option>
            <option value="5 GHz">5 GHz</option>
            <option value="Ethernet">Ethernet</option>
            <option value="Unknown">Unknown</option>
          </select>
          <select
            aria-label="Owner"
            value={owner}
            onChange={(event) => {
              setOwner(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">Any owner</option>
            {owners.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>
        <div className="filter-group device-sort-fields">
          <span className="filter-group-label">Sort results</span>
          <select
            aria-label="Sort devices by"
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as DeviceSort)
              setPage(1)
            }}
          >
            <option value="name">Sort: Name</option>
            <option value="status">Sort: Status</option>
            <option value="lastSeen">Sort: Last seen</option>
            <option value="firstSeen">Sort: First seen</option>
            <option value="ipAddress">Sort: IP address</option>
            <option value="owner">Sort: Owner</option>
            <option value="category">Sort: Category</option>
            <option value="ssid">Sort: SSID</option>
          </select>
          <button
            type="button"
            aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
            onClick={() => {
              setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          >
            {sortDirection === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
          </button>
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
                  <span
                    className={`device-status ${device.online && !device.blockedAt ? 'online' : ''}`}
                  >
                    {deviceStatus(device)}
                  </span>
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
        <div className="dialog-state">
          {view === 'archived' && archivedCount === 0
            ? 'No hidden devices.'
            : 'No devices match all selected filters.'}
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
          <label>
            Rows
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
          <div>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <strong>
              {currentPage} / {pageCount}
            </strong>
            <button
              type="button"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
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
