import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { ComponentProps, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, TextInputProps } from 'react-native'
import FastImage from 'react-native-fast-image'
import { FadeIn, FadeOut, FadeOutDown } from 'react-native-reanimated'
import { useAppDispatch, useShouldShowNativeKeyboard } from 'src/app/hooks'
import { FiatOnRampStackParamList } from 'src/app/navigation/types'
import { FiatOnRampCtaButton } from 'src/components/fiatOnRamp/CtaButton'
import { Screen } from 'src/components/layout/Screen'
import { FiatOnRampAmountSection } from 'src/features/fiatOnRamp/FiatOnRampAmountSection'
import { useFiatOnRampContext } from 'src/features/fiatOnRamp/FiatOnRampContext'
import { FiatOnRampCountryListModal } from 'src/features/fiatOnRamp/FiatOnRampCountryListModal'
import { FiatOnRampCountryPicker } from 'src/features/fiatOnRamp/FiatOnRampCountryPicker'
import { FiatOnRampTokenSelectorModal } from 'src/features/fiatOnRamp/FiatOnRampTokenSelector'
import {
  useFiatOnRampQuotes,
  useMeldFiatCurrencySupportInfo,
  useParseFiatOnRampError,
} from 'src/features/fiatOnRamp/aggregatorHooks'
import { useFiatOnRampSupportedTokens } from 'src/features/fiatOnRamp/hooks'
import { FiatOnRampCurrency, InitialQuoteSelection } from 'src/features/fiatOnRamp/types'
import { AnimatedFlex, Flex, Text, useIsDarkMode } from 'ui/src'
import { FiatOnRampEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { UniverseEventProperties } from 'uniswap/src/features/telemetry/types'
import { FiatOnRampScreens } from 'uniswap/src/types/screens/mobile'
import { usePrevious } from 'utilities/src/react/hooks'
import { DEFAULT_DELAY, useDebounce } from 'utilities/src/time/timing'
import { DecimalPadLegacy } from 'wallet/src/components/legacy/DecimalPadLegacy'
import { useBottomSheetContext } from 'wallet/src/components/modals/BottomSheetContext'
import { HandleBar } from 'wallet/src/components/modals/HandleBar'
import {
  useFiatOnRampAggregatorGetCountryQuery,
  useFiatOnRampAggregatorServiceProvidersQuery,
  useFiatOnRampAggregatorTransactionQuery,
} from 'wallet/src/features/fiatOnRamp/api'
import { FORQuote, FORServiceProvider, FORTransaction } from 'wallet/src/features/fiatOnRamp/types'
import { getServiceProviderLogo } from 'wallet/src/features/fiatOnRamp/utils'
import { pushNotification } from 'wallet/src/features/notifications/slice'
import { AppNotificationType } from 'wallet/src/features/notifications/types'

type Props = NativeStackScreenProps<FiatOnRampStackParamList, FiatOnRampScreens.AmountInput>

function selectInitialQuote(
  quotes: FORQuote[] | undefined,
  lastTransaction: FORTransaction | undefined
): { quote: FORQuote | undefined; type: InitialQuoteSelection | undefined } {
  const lastUsedServiceProvider = lastTransaction?.serviceProvider
  if (lastUsedServiceProvider) {
    const quote = quotes?.filter((q) => q.serviceProvider === lastUsedServiceProvider)[0]
    if (quote) {
      return {
        quote,
        type: InitialQuoteSelection.MostRecent,
      }
    }
  }
  const bestQuote = quotes && quotes.length && quotes[0]
  if (bestQuote) {
    return {
      quote: quotes.reduce<FORQuote>((prev, curr) => {
        return curr.destinationAmount > prev.destinationAmount ? curr : prev
      }, bestQuote),
      type: InitialQuoteSelection.Best,
    }
  }
  return { quote: undefined, type: undefined }
}

function preloadServiceProviderLogos(
  serviceProviders: FORServiceProvider[],
  isDarkMode: boolean
): void {
  FastImage.preload(
    serviceProviders
      .map((sp) => ({ uri: getServiceProviderLogo(sp.logos, isDarkMode) }))
      .filter((sp) => !!sp.uri)
  )
}

const PREDEFINED_AMOUNTS_SUPPORTED_CURRENCIES = ['usd', 'eur', 'gbp', 'aud', 'cad', 'sgd']

export function FiatOnRampScreen({ navigation }: Props): JSX.Element {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const isDarkMode = useIsDarkMode()
  const [selection, setSelection] = useState<TextInputProps['selection']>()
  const [value, setValue] = useState('')
  const [showTokenSelector, setShowTokenSelector] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const [selectingCountry, setSelectingCountry] = useState(false)

  const { isSheetReady } = useBottomSheetContext()

  const {
    selectedQuote,
    setSelectedQuote,
    setQuotesSections,
    countryCode,
    setCountryCode,
    countryState,
    setCountryState,
    amount,
    setAmount,
    setBaseCurrencyInfo,
    setServiceProviders,
    quoteCurrency,
    setQuoteCurrency,
  } = useFiatOnRampContext()

  const resetSelection = (start: number, end?: number): void => {
    setSelection({ start, end: end ?? start })
  }

  const { showNativeKeyboard, onDecimalPadLayout, isLayoutPending, onInputPanelLayout } =
    useShouldShowNativeKeyboard()

  const { appFiatCurrencySupportedInMeld, meldSupportedFiatCurrency, supportedFiatCurrencies } =
    useMeldFiatCurrencySupportInfo(countryCode)

  const debouncedAmount = useDebounce(amount, DEFAULT_DELAY * 2)
  const {
    error: quotesError,
    loading: quotesLoading,
    quotes,
  } = useFiatOnRampQuotes({
    baseCurrencyAmount: debouncedAmount,
    baseCurrencyCode: meldSupportedFiatCurrency.code,
    quoteCurrencyCode: quoteCurrency.meldCurrencyCode,
    countryCode,
    countryState,
  })

  const selectTokenLoading = quotesLoading || amount !== debouncedAmount

  const { currentData: ipCountryData } = useFiatOnRampAggregatorGetCountryQuery()

  useEffect(() => {
    if (ipCountryData) {
      setCountryCode(ipCountryData.countryCode)
      setCountryState(ipCountryData.state)
    }
  }, [ipCountryData, setCountryCode, setCountryState])

  const {
    currentData: serviceProvidersResponse,
    isFetching: serviceProvidersLoading,
    error: serviceProvidersError,
  } = useFiatOnRampAggregatorServiceProvidersQuery({ countryCode })

  // preload service provider logos for given quotes for the next screen
  useEffect(() => {
    if (serviceProvidersResponse?.serviceProviders && quotes) {
      const quotesServiceProviderNames = quotes.map((q) => q.serviceProvider)
      const serviceProviders = serviceProvidersResponse.serviceProviders.filter(
        (sp) => quotesServiceProviderNames.indexOf(sp.serviceProvider) !== -1
      )
      preloadServiceProviderLogos(serviceProviders, isDarkMode)
    }
  }, [serviceProvidersResponse, quotes, isDarkMode])

  const { currentData: transactionResponse } = useFiatOnRampAggregatorTransactionQuery({})

  const prevQuotes = usePrevious(quotes)
  useEffect(() => {
    if (quotes && (!selectedQuote || prevQuotes !== quotes)) {
      const { quote, type } = selectInitialQuote(quotes, transactionResponse?.transaction)
      if (!quote) {
        return
      }
      if (type === InitialQuoteSelection.MostRecent) {
        const otherQuotes = quotes.filter((item) => item !== quote)
        setQuotesSections([
          { data: [quote], type },
          ...(otherQuotes.length ? [{ data: otherQuotes }] : []),
        ])
      } else {
        setQuotesSections([{ data: quotes, type }])
      }
      setSelectedQuote(quote)
    }
  }, [
    prevQuotes,
    quotes,
    selectedQuote,
    setQuotesSections,
    setSelectedQuote,
    t,
    transactionResponse,
  ])

  useEffect(() => {
    if (!quotes && (quotesError || serviceProvidersError || !amount)) {
      setQuotesSections(undefined)
      setSelectedQuote(undefined)
    }
  }, [amount, quotesError, serviceProvidersError, quotes, setQuotesSections, setSelectedQuote])

  const onSelectCountry: ComponentProps<typeof FiatOnRampCountryListModal>['onSelectCountry'] = (
    country
  ): void => {
    dispatch(
      pushNotification({
        type: AppNotificationType.ChooseCountry,
        countryName: country.displayName,
        countryCode: country.countryCode,
      })
    )
    setSelectingCountry(false)
    // UI does not allow to set the state
    setCountryState(undefined)
    setCountryCode(country.countryCode)
  }

  const onChangeValue =
    (source: UniverseEventProperties[FiatOnRampEventName.FiatOnRampAmountEntered]['source']) =>
    (newAmount: string): void => {
      sendAnalyticsEvent(FiatOnRampEventName.FiatOnRampAmountEntered, {
        source,
      })
      setValue(newAmount)
      setAmount(newAmount ? parseFloat(newAmount) : 0)
    }

  // hide keyboard when user goes to token selector screen
  useEffect(() => {
    if (showTokenSelector) {
      inputRef.current?.blur()
    } else if (showNativeKeyboard) {
      inputRef.current?.focus()
    }
  }, [showNativeKeyboard, showTokenSelector])

  // we only show loading when there are no errors and quote value is not empty
  const buttonDisabled =
    serviceProvidersLoading ||
    !!serviceProvidersError ||
    selectTokenLoading ||
    !!quotesError ||
    !selectedQuote?.destinationAmount

  const onContinue = (): void => {
    if (
      quotes &&
      serviceProvidersResponse?.serviceProviders &&
      serviceProvidersResponse?.serviceProviders.length > 0 &&
      quoteCurrency?.currencyInfo?.currency
    ) {
      setBaseCurrencyInfo(meldSupportedFiatCurrency)
      setServiceProviders(serviceProvidersResponse.serviceProviders)
      navigation.navigate(FiatOnRampScreens.ServiceProviders)
    }
  }

  const {
    list: supportedTokensList,
    loading: supportedTokensLoading,
    error: supportedTokensError,
    refetch: supportedTokensRefetch,
  } = useFiatOnRampSupportedTokens({
    sourceCurrencyCode: meldSupportedFiatCurrency.code,
    countryCode,
  })

  const onSelectCurrency = (newCurrency: FiatOnRampCurrency): void => {
    setQuoteCurrency(newCurrency)
    setShowTokenSelector(false)
    if (newCurrency.currencyInfo?.currency.symbol) {
      sendAnalyticsEvent(FiatOnRampEventName.FiatOnRampTokenSelected, {
        token: newCurrency.currencyInfo.currency.symbol.toLowerCase(),
      })
    }
  }

  // We only support predefined amounts for certain currencies.
  const predefinedAmountsSupported = PREDEFINED_AMOUNTS_SUPPORTED_CURRENCIES.includes(
    meldSupportedFiatCurrency.code.toLowerCase()
  )

  const notAvailableInThisRegion = supportedFiatCurrencies?.length === 0

  const { errorText, errorColor } = useParseFiatOnRampError(
    !notAvailableInThisRegion && (quotesError || serviceProvidersError),
    meldSupportedFiatCurrency.code
  )

  return (
    <Screen edges={['top']}>
      <HandleBar backgroundColor="none" />
      <AnimatedFlex row height="100%" pt="$spacing12">
        {isSheetReady && (
          <AnimatedFlex
            entering={FadeIn}
            exiting={FadeOut}
            gap="$spacing16"
            px="$spacing24"
            width="100%">
            <Flex row alignItems="center" justifyContent="space-between">
              <Text variant="subheading1">{t('common.button.buy')}</Text>
              <FiatOnRampCountryPicker
                countryCode={countryCode}
                onPress={(): void => {
                  setSelectingCountry(true)
                }}
              />
            </Flex>
            <FiatOnRampAmountSection
              appFiatCurrencySupported={appFiatCurrencySupportedInMeld}
              currency={quoteCurrency}
              errorColor={errorColor}
              errorText={errorText}
              fiatCurrencyInfo={meldSupportedFiatCurrency}
              inputRef={inputRef}
              notAvailableInThisRegion={notAvailableInThisRegion}
              predefinedAmountsSupported={predefinedAmountsSupported}
              quoteAmount={selectedQuote?.destinationAmount ?? 0}
              quoteCurrencyAmountReady={Boolean(amount && selectedQuote)}
              selectTokenLoading={selectTokenLoading}
              setSelection={setSelection}
              showNativeKeyboard={showNativeKeyboard}
              showSoftInputOnFocus={showNativeKeyboard}
              value={value}
              onChoosePredifendAmount={onChangeValue('chip')}
              onEnterAmount={onChangeValue('textInput')}
              onInputPanelLayout={onInputPanelLayout}
              onTokenSelectorPress={(): void => {
                setShowTokenSelector(true)
              }}
            />
            <AnimatedFlex
              bottom={0}
              exiting={FadeOutDown}
              gap="$spacing8"
              left={0}
              opacity={isLayoutPending ? 0 : 1}
              pb="$spacing24"
              position="absolute"
              px="$spacing24"
              right={0}
              onLayout={onDecimalPadLayout}>
              {!showNativeKeyboard && (
                <DecimalPadLegacy
                  hasCurrencyPrefix
                  disabled={notAvailableInThisRegion}
                  resetSelection={resetSelection}
                  selection={selection}
                  setValue={onChangeValue('textInput')}
                  value={value}
                />
              )}
              <FiatOnRampCtaButton
                eligible
                continueButtonText={t('common.button.continue')}
                disabled={buttonDisabled}
                onPress={onContinue}
              />
            </AnimatedFlex>
          </AnimatedFlex>
        )}
      </AnimatedFlex>
      {selectingCountry && countryCode && (
        <FiatOnRampCountryListModal
          countryCode={countryCode}
          onClose={(): void => {
            setSelectingCountry(false)
          }}
          onSelectCountry={onSelectCountry}
        />
      )}
      {showTokenSelector && countryCode && (
        <FiatOnRampTokenSelectorModal
          error={supportedTokensError}
          list={supportedTokensList}
          loading={supportedTokensLoading}
          onClose={(): void => setShowTokenSelector(false)}
          onRetry={supportedTokensRefetch}
          onSelectCurrency={onSelectCurrency}
        />
      )}
    </Screen>
  )
}
