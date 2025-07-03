/**
 * Python code:
 *
 * ```python
 *
 * def format_uptime(uptime_str):
 *     from datetime import datetime, timezone
 *     # Parse the uptime string into a datetime object
 *     uptime_dt = datetime.fromisoformat(uptime_str)
 *     uptime_dt = uptime_dt.replace(tzinfo=timezone.utc)  # Ensure it's in UTC
 *
 *     # Get the current time in UTC
 *     now = datetime.now(timezone.utc)
 *
 *     # Calculate the difference between now and the uptime
 *     delta = now - uptime_dt
 *
 *     # Format the result based on the time difference
 *     if delta.total_seconds() < 3600:  # Less than 1 hour
 *         return "new"
 *     elif delta.total_seconds() < 86400:  # Less than 1 day
 *         hours = delta.total_seconds() // 3600
 *         return f"{int(hours)} hours"
 *     else:  # 1 day or more
 *         days = delta.total_seconds() // 86400
 *         return f"{int(days)} days"
 *  * ```
 * @param uptime
 */

export function formatUptime(uptime: string) {
  // Parse the uptime string as an ISO date in UTC
  const uptimeDate = new Date(uptime);
  if (isNaN(uptimeDate.getTime())) {
    throw new Error('Invalid date string');
  }
  // Get current time in UTC
  const now = new Date();
  // Calculate the difference in seconds
  const deltaSeconds = Math.floor((now.getTime() - uptimeDate.getTime()) / 1000);
  if (deltaSeconds < 3600) {
    return 'new';
  } else if (deltaSeconds < 86400) {
    const hours = Math.floor(deltaSeconds / 3600);
    return `${hours} hours`;
  } else {
    const days = Math.floor(deltaSeconds / 86400);
    return `${days} days`;
  }
}
