interface TimestampProps {
  timestamp: Date | string
}

export function Timestamp({ timestamp }: TimestampProps) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return <span className="text-muted-foreground">Invalid date</span>
  }

  return <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>
}
