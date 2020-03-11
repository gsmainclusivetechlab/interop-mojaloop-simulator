'use strict'

const sendRequest = require('../lib/sendRequest')
const Logger = require('@mojaloop/central-services-logger')
const Enums = require('@mojaloop/central-services-shared').Enum
const uuid = require('uuid')

const transfersEndpoint =
  process.env.TRANSFERS_ENDPOINT || 'http://localhost:1080'

exports.postTransfers = async ({ payload, headers }) => {
  const EXPIRATION_TIME = 600000
  const url = `${transfersEndpoint}/transfers`

  try {
    const body = {
      transferId: uuid.v4(),
      payerFsp: headers['fspiop-destination'],
      payeeFsp: headers['fspiop-source'],
      amount: payload.transferAmount,
      expiration: new Date(new Date().getTime() + EXPIRATION_TIME),
      ilpPacket: payload.ilpPacket,
      condition: payload.condition
    }

    const opts = {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.interoperability.transfers+json;version=1',
        'Content-Type':
          'application/vnd.interoperability.transfers+json;version=1.0',
        Date: new Date().toUTCString(),
        'FSPIOP-Source': headers['fspiop-destination'],
        'FSPIOP-Destination': headers['fspiop-source'],
        'FSPIOP-Signature': headers['fspiop-signature'],
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
