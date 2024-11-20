export const DEFAULT_LOCALE = 'en-US'

export const SUPPORTED_LOCALES = [
  'en-US',
  // Add other supported locales here
] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export const DEFAULT_TRANSLATIONS = {
  'en-US': {
    // Add your translation keys and values here
    common: {
      somethingWentWrong: {
        error: 'Something went wrong',
      },
      error: {
        request: 'Please try again later',
      },
      reload: {
        label: 'Reload',
      },
      getSupport: {
        button: 'Get Support',
      },
      showMore: {
        button: 'Show more',
      },
      showLess: {
        button: 'Show less',
      },
    },
    error: {
      request: {
        provideId: 'Please provide this error ID when contacting support:',
      },
      id: 'Error ID: {{eventId}}',
    },
  },
}

export const getLocaleLabel = (locale: SupportedLocale): string => {
  switch (locale) {
    case 'en-US':
      return 'English'
    // Add other locale labels here
    default:
      return locale
  }
} 