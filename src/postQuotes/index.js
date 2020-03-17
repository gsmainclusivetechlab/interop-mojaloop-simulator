'use strict'

const sendRequest = require('../lib/sendRequest')
const Logger = require('@mojaloop/central-services-logger')
const Enums = require('@mojaloop/central-services-shared').Enum
const uuid = require('uuid')

const quotesEndpoint = process.env.QUOTES_ENDPOINT || 'http://localhost:1080'

exports.postQuotes = async ({ payload, headers }) => {
  const url = `${quotesEndpoint}/quotes`

  try {
    const body = {
      quoteId: uuid.v4(),
      transactionId: uuid.v4(),
      transactionRequestId: payload.transactionRequestId,
      payer: {
        partyIdInfo: {
          partyIdType: payload.payer.partyIdType,
          partyIdentifier: payload.payer.partyIdentifier,
          fspId: payload.payer.fspId
        },
        personalInfo: {
          complexName: {
            firstName: 'John',
            lastName: 'Doe'
          },
          dateOfBirth: '1970-01-01'
        }
      },
      payee: {
        partyIdInfo: {
          partyIdType: payload.payee.partyIdInfo.partyIdType,
          partyIdentifier: payload.payee.partyIdInfo.partyIdentifier,
          fspId: payload.payee.partyIdInfo.fspId
        },
        name: payload.payee.name,
        personalInfo: payload.payee.personalInfo
      },
      amountType: 'SEND',
      amount: {
        amount: payload.amount.amount,
        currency: payload.amount.currency
      },
      transactionType: {
        scenario: 'PAYMENT',
        initiator: 'PAYEE',
        initiatorType: payload.transactionType.initiatorType
      },
      note: payload.note
    }

    const opts = {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.interoperability.quotes+json',
        'Content-Type':
          'application/vnd.interoperability.quotes+json;version=1.0',
        Date: new Date().toUTCString(),
        'FSPIOP-Source': headers['fspiop-destination'],
        'FSPIOP-Destination': headers['fspiop-source'],
        'FSPIOP-Signature': headers['fspiop-signature'],
        Authorization: `Bearer {{${headers['fspiop-destination'].toUpperCase()}_BEARER_TOKEN}}`,
        traceparent: headers.traceparent
      },
      transformRequest: [
        (data, headers) => {
          delete headers.common.Accept
          return data
        }
      ],
      data: JSON.stringify(body)
    }

    const response = await sendRequest(url, opts)
    Logger.isInfoEnabled && Logger.info(`response: ${response.status}`)

    if (response.status !== Enums.Http.ReturnCodes.ACCEPTED.CODE) {
      throw new Error(`Failed to send. Result: ${JSON.stringify(response)}`)
    }
  } catch (error) {
    Logger.isErrorEnabled && Logger.error(error)
  }
}
