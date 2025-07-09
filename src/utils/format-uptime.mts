/**
 * Formats an uptime string into a human-readable format (e.g., "new", "X hours", "Y days").
 * This provides a more user-friendly representation of container uptime in Home Assistant.
 * @param uptime The ISO 8601 formatted uptime string from Docker.
 */
export function formatUptime(uptime: string) {
  // Parse the uptime string as an ISO date in UTC.
  const uptimeDate = new Date(uptime);
  if (isNaN(uptimeDate.getTime())) {
    throw new Error('Invalid date string');
  }
  // Get current time in UTC.
  const now = new Date();
  // Calculate the difference in seconds.
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
