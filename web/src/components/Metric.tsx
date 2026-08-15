export function Metric({
  label,
  value,
  featured = false,
}: {
  label: string
  value: string
  featured?: boolean
}) {
  return (
    <article className={`metric ${featured ? 'featured' : ''}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}
