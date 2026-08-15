export const formatBytes = (bytes: number | null) => {
  if (bytes === null) return 'Unavailable'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit < 3 ? 0 : 1)} ${units[unit]}`
}
