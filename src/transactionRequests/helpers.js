'use strict'

const sendRequest = require('../lib/sendRequest')
const Logger = require('@mojaloop/central-services-logger')
const Enums = require('@mojaloop/central-services-shared').Enum

const { requestsCache } = require('./handler')

const transactionRequestsEndpoint = process.env.TRANSACTION_REQUESTS_ENDPOINT || 'http://moja-transaction-requests-service'

exports.putTransactionRequest = async (request, cb, requestState) => {
  const url = transactionRequestsEndpoint + '/transactionRequests/' + request.payload.transactionRequestId

  try {
    requestsCache.set('transactionRequestId', request.payload.transactionRequestId)

    // amount to emulate test case "Transaction Request Rejected by Payer"
    const INVALID_AMOUNT_VALUE = 15.15
    const isAmountInvalid = parseFloat(
      request.payload &&
      request.payload.amount &&
      request.payload.amount.amount
    ) === INVALID_AMOUNT_VALUE

    const transactionRequestsResponse = {
      transactionId: request.payload.transactionRequestId,
      transactionRequestState: requestState || (isAmountInvalid ? 'REJECTED' : 'RECEIVED'),
      extensionList: request.payload.extensionList
    }

    const opts = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/vnd.interoperability.transfers+json;version=1.0',
        'FSPIOP-Source': request.headers['fspiop-destination'],
        'FSPIOP-Destination': request.headers['fspiop-source'],
        Date: new Date().toUTCString(),
        'FSPIOP-HTTP-Method': 'PUT',
        'FSPIOP-URI': `/transactionRequests/${request.payload.transactionRequestId}`
      },
      transformRequest: [(data, headers) => {
        delete headers.common.Accept
        return data
      }],
      data: JSON.stringify(transactionRequestsResponse)
    }
    const res = await sendRequest(url, opts, request.span)
    Logger.info(`response: ${res.status}`)
    if (res.status !== Enums.Http.ReturnCodes.OK.CODE) {
      throw new Error(`Failed to send. Result: ${JSON.stringify(res)}`)
    }

    const transactionRequestState = transactionRequestsResponse.transactionRequestState

    if (transactionRequestState === 'REJECTED') return

    await cb(request)
  } catch (err) {
    Logger.error(err)
  }
}

exports.requestsCache = requestsCache