'use strict'

const sendRequest = require('../lib/sendRequest')
const Logger = require('@mojaloop/central-services-logger')
const Enums = require('@mojaloop/central-services-shared').Enum

const authorizationsEndpoint =
  process.env.AUTHORIZATIONS_ENDPOINT || 'http://localhost:1080'

exports.getAuthorizations = async ({ payload, headers }, id) => {
  const url = `${authorizationsEndpoint}/authorizations/${id}?authenticationType=OTP&retriesLeft=3&amount=${payload.transferAmount.amount}&currency=${payload.transferAmount.currency}`

  try {
    const opts = {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.interoperability.authorizations+json;version=1',
        'Content-Type':
          'application/vnd.interoperability.authorizations+json;version=1.0',
        Date: new Date().toUTCString(),
        'FSPIOP-Source': headers['fspiop-destination'],
        'FSPIOP-Destination': headers['fspiop-source'],
        traceparent: headers.traceparent
      }
    };

    const response = await sendRequest(url, opts)
    Logger.isInfoEnabled && Logger.info(`response: ${response.status}`)

    if (response.status !== Enums.Http.ReturnCodes.ACCEPTED.CODE) {
      throw new Error(`Failed to send. Result: ${JSON.stringify(response)}`)
    }
  } catch (error) {
    Logger.isErrorEnaled && Logger.error(error)
  }
}
