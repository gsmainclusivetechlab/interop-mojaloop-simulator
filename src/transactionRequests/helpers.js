'use strict'

const sendRequest = require('../lib/sendRequest')
const Logger = require('@mojaloop/central-services-logger')
const Enums = require('@mojaloop/central-services-shared').Enum

const { requestsCache } = require('./handler')

const transactionRequestsEndpoint = process.env.TRANSACTION_REQUESTS_ENDPOINT || 'http://moja-transaction-requests-service'

exports.putTransactionRequest = async (request, cb, requestState, noTraceState) => {
  const trxId = requestsCache.get('transactionRequestId')
  const url = transactionRequestsEndpoint + '/transactionRequests/' + trxId

  try {
    const transactionRequestsResponse = {
      transactionId: trxId,
      transactionRequestState: requestState || 'RECEIVED',
      extensionList: request.payload.extensionList
    }

    const opts = {
      method: 'PUT',
      headers: {
        ID: request.payload.transactionRequestId,
        'Content-Type': 'application/vnd.interoperability.transactionRequests+json;version=1.0',
        'FSPIOP-Source': request.headers['fspiop-destination'],
        'FSPIOP-Destination': request.headers['fspiop-source'],
        Date: new Date().toUTCString(),
        'FSPIOP-HTTP-Method': 'PUT',
        'FSPIOP-URI': `/transactionRequests/${trxId}`,
        traceparent: request.headers.traceparent ? request.headers.traceparent : undefined,
        tracestate: !noTraceState && request.headers.tracestate ? request.headers.tracestate : undefined
      },
      transformRequest: [(data, headers) => {
        delete headers.common.Accept
        return data
      }],
      data: JSON.stringify(transactionRequestsResponse)
    }
    const res = await sendRequest(url, opts)
    Logger.isInfoEnabled && Logger.info(`response: ${res.status}`)
    if (res.status !== Enums.Http.ReturnCodes.OK.CODE) {
      throw new Error(`Failed to send. Result: ${JSON.stringify(res)}`)
    }

    const transactionRequestState = transactionRequestsResponse.transactionRequestState

    if (transactionRequestState === 'REJECTED') return

    await cb(request)
  } catch (err) {
    Logger.isErrorEnabled && Logger.error(err)
  }
}

exports.requestsCache = requestsCache
