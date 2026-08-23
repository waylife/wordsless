/**
 * Notification copy — the strings we send to the user. Kept here so
 * future localization (F-i18n) can swap a single module instead of
 * grepping through scheduler code.
 */
export interface ReminderContent {
  title: string;
  body: string;
}

export const DAILY_REMINDER_CONTENT: ReminderContent = {
  title: '该背单词啦 ✨',
  body: '今天的新词和复习已经准备好了,5 分钟开始。',
};

/** Identifier used in `setNotificationHandler` and category names. */
export const REMINDER_CATEGORY_ID = 'wordsless.daily-reminder';

/** Android notification channel — must be created before the first schedule. */
export const REMINDER_CHANNEL_ID = 'wordsless-reminders';
export const REMINDER_CHANNEL_NAME = '每日提醒';
export const REMINDER_CHANNEL_DESCRIPTION = '每天到点提醒你打开 Wordsless 背单词';
