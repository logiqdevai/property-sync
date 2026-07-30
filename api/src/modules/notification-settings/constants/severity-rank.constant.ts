import { NotificationSeverity } from 'generated/prisma';

// Higher rank = more severe. Used to compare an incoming notification's
// severity against a setting's min_severity threshold.
export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  [NotificationSeverity.INFO]: 0,
  [NotificationSeverity.WARNING]: 1,
  [NotificationSeverity.CRITICAL]: 2,
};
