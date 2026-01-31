interface TimestampProps {
  timestamp: Date
}

export function Timestamp({ timestamp }: TimestampProps) {
  return (
    <time dateTime={timestamp.toISOString()}>{timestamp.toLocaleString()}</time>
  )
}
