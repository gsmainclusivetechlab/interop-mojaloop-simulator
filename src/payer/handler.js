/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Georgi Georgiev georgi.georgiev@modusbox.com
 - Murthy Kakarlamudi murthy@modusbox.com
 --------------
 ******/

'use strict'

const NodeCache = require('node-cache')
const correlationCache = new NodeCache()
const requestCache = new NodeCache()
const callbackCache = new NodeCache()
const Metrics = require('../lib/metrics')
const Logger = require('@mojaloop/central-services-logger')
const Enums = require('@mojaloop/central-services-shared').Enum
const Metrics = require('../lib/metrics')
const base64url = require('base64url')

const { requestsCache } = require('../transactionRequests/helpers')

const { putTransactionRequest } = require('../transactionRequests/helpers')
const { postTransfers } = require('../postTransfers')
const { getAuthorizations } = require('../getAuthorizations')
const { isRejectedTransactionFlow, isOTPVerificationFlow } = require('../helpers')

const transfersCondition = process.env.TRANSFERS_CONDITION || 'HOr22-H3AfTDHrSkPjJtVPRdKouuMkDXTR4ejlQa8Ks'
const transfersIlpPacket = process.env.TRANSFERS_ILPPACKET || 'AQAAAAAAAADIEHByaXZhdGUucGF5ZWVmc3CCAiB7InRyYW5zYWN0aW9uSWQiOiIyZGY3NzRlMi1mMWRiLTRmZjctYTQ5NS0yZGRkMzdhZjdjMmMiLCJxdW90ZUlkIjoiMDNhNjA1NTAtNmYyZi00NTU2LThlMDQtMDcwM2UzOWI4N2ZmIiwicGF5ZWUiOnsicGFydHlJZEluZm8iOnsicGFydHlJZFR5cGUiOiJNU0lTRE4iLCJwYXJ0eUlkZW50aWZpZXIiOiIyNzcxMzgwMzkxMyIsImZzcElkIjoicGF5ZWVmc3AifSwicGVyc29uYWxJbmZvIjp7ImNvbXBsZXhOYW1lIjp7fX19LCJwYXllciI6eyJwYXJ0eUlkSW5mbyI6eyJwYXJ0eUlkVHlwZSI6Ik1TSVNETiIsInBhcnR5SWRlbnRpZmllciI6IjI3NzEzODAzOTExIiwiZnNwSWQiOiJwYXllcmZzcCJ9LCJwZXJzb25hbEluZm8iOnsiY29tcGxleE5hbWUiOnt9fX0sImFtb3VudCI6eyJjdXJyZW5jeSI6IlVTRCIsImFtb3VudCI6IjIwMCJ9LCJ0cmFuc2FjdGlvblR5cGUiOnsic2NlbmFyaW8iOiJERVBPU0lUIiwic3ViU2NlbmFyaW8iOiJERVBPU0lUIiwiaW5pdGlhdG9yIjoiUEFZRVIiLCJpbml0aWF0b3JUeXBlIjoiQ09OU1VNRVIiLCJyZWZ1bmRJbmZvIjp7fX19'
let transferAmount = {}

const extractUrls = (request) => {
  const urls = {}
  request.server.table()[0].table.filter(route => {
    return route.settings.id !== undefined &&
      Array.isArray(route.settings.tags) &&
      route.settings.tags.indexOf('api') >= 0
  }).forEach(route => {
    urls[route.settings.id] = `localhost${route.path.replace(/\{/g, ':').replace(/\}/g, '')}`
  })
  return urls
}

exports.metadata = function (request, h) {
  return h.response({
    directory: 'localhost',
    urls: extractUrls(request)
  }).code(Enums.Http.ReturnCodes.OK.CODE)
}

// Section about /participants
exports.putParticipantsByTypeId = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putParticipantsByTypeId - START`)

  Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /payerfsp/participants/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }
  callbackCache.set(request.params.id, incomingRequest)

  correlationCache.set(request.params.id, request.payload)

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putParticipantsByTypeId - END`)
  histTimerEnd({ success: true, fsp: 'payer', operation: 'putParticipantsByTypeId', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })
  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

// Section about /parties
exports.putPartiesByTypeId = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putPartiesByTypeId - START`)

  Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /payerfsp/parties/${request.params.type}/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }
  callbackCache.set(request.params.id, incomingRequest)

  correlationCache.set(request.params.id, request.payload)

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putPartiesByTypeId - END`)
  histTimerEnd({ success: true, fsp: 'payer', operation: 'putPartiesByTypeId', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })
  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.putPartiesByTypeIdAndError = function (request, h) {
  console.log((new Date().toISOString()), `IN PAYERFSP:: PUT /payerfsp/parties//${request.params.type}/${request.params.id}/error`, request.payload)
  correlationCache.set(request.params.id, request.payload)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }
  callbackCache.set(request.params.id, incomingRequest)

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

// Section about Quotes
exports.postQuotes = function (request, h) {
  (async function () {
    const histTimerEnd = Metrics.getHistogram(
      'sim_request',
      'Histogram for Simulator http operations',
      ['success', 'fsp', 'operation', 'source', 'destination']
    ).startTimer()

    const metadata = `${request.method} ${request.path}`
    const quotesRequest = request.payload

    Logger.info((new Date().toISOString()), ['IN PAYERFSP::'], `received: ${metadata}. `)
    Logger.info(`incoming request: ${quotesRequest.quoteId}`)

    // Saving Incoming request
    const incomingRequest = {
      headers: request.headers,
      data: request.payload
    }

    requestCache.set(quotesRequest.quoteId, incomingRequest)

    const quotesResponse = {
      transferAmount: {
        amount: quotesRequest.amount.amount,
        currency: quotesRequest.amount.currency
      },
      expiration: new Date(new Date().getTime() + 10000),
      ilpPacket: transfersIlpPacket,
      condition: transfersCondition
    }

    try {
      const url = quotesEndpoint + '/quotes/' + quotesRequest.quoteId
      const protectedHeader = {
        alg: 'RS256',
        'FSPIOP-Source': `${request.headers['fspiop-destination']}`,
        'FSPIOP-Destination': `${request.headers['fspiop-source']}`,
        'FSPIOP-URI': `/quotes/${quotesRequest.quoteId}`,
        'FSPIOP-HTTP-Method': 'PUT',
        Date: ''
      }
      const fspiopSignature = {
        signature: signature,
        protectedHeader: `${base64url.encode(JSON.stringify(protectedHeader))}`
      }
      const opts = {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.interoperability.quotes+json;version=1.0',
          'FSPIOP-Source': request.headers['fspiop-destination'],
          'FSPIOP-Destination': request.headers['fspiop-source'],
          Date: new Date().toUTCString(),
          'FSPIOP-Signature': `${JSON.stringify(fspiopSignature)}`,
          'FSPIOP-HTTP-Method': 'PUT',
          'FSPIOP-URI': `/quotes/${quotesRequest.quoteId}`,
          traceparent: request.headers.traceparent ? request.headers.traceparent : undefined,
          tracestate: request.headers.tracestate ? request.headers.tracestate : undefined
        },
        transformRequest: [(data, headers) => {
          delete headers.common.Accept
          return data
        }],
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        }),
        data: JSON.stringify(quotesResponse)
      }

      Logger.info((new Date().toISOString()), 'Executing PUT', url)

      const response = await sendRequest(url, opts, request.span)

      Logger.info((new Date().toISOString()), 'response: ', response.status)

      if (response.status !== Enums.Http.ReturnCodes.ACCEPTED.CODE) {
        throw new Error(`Failed to send. Result: ${response}`)
      }

      histTimerEnd({ success: true, fsp: 'payee', operation: 'postQuotes', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })
    } catch (err) {
      Logger.error(err)

      histTimerEnd({ success: false, fsp: 'payee', operation: 'postQuotes', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })
    }
  })()

  return h.response().code(Enums.Http.ReturnCodes.ACCEPTED.CODE)
}

exports.putQuotesById = function (request, h) {
  (async () => {
    const histTimerEnd = Metrics.getHistogram(
      'sim_request',
      'Histogram for Simulator http operations',
      ['success', 'fsp', 'operation', 'source', 'destination']
    ).startTimer()

    Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /quotes/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

    // Saving Incoming request
    const incomingRequest = {
      headers: request.headers,
      data: request.payload
    }

    callbackCache.set(request.params.id, incomingRequest)
    correlationCache.set(request.params.id, request.payload)
    transferAmount = request.payload.transferAmount

    histTimerEnd({ success: true, fsp: 'payer', operation: 'putQuotesById', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })

    if (isRejectedTransactionFlow(request.payload.transferAmount.amount)) {
      await putTransactionRequest(request, null, 'REJECTED', true)

      return
    }

    if (isOTPVerificationFlow(request.payload.transferAmount.amount)) {
      const trxId = requestsCache.get('transactionRequestId')

      await getAuthorizations(request, trxId)

      return
    }

    await postTransfers(request)
  })()

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.putQuotesByIdAndError = function (request, h) {
  console.log((new Date().toISOString()), 'IN PAYERFSP:: PUT /payerfsp/quotes/' + request.params.id + '/error', request.payload)
  correlationCache.set(request.params.id, request.payload)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }
  callbackCache.set(request.params.id, incomingRequest)

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

// Section about Transfers
exports.putTransfersById = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()
  Logger.isPerfEnabled && Logger.perf(`[cid=${request.params.id}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::putTransfersById - START`)

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putTransfersById - START`)

  Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /payerfsp/transfers/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }
  callbackCache.set(request.params.id, incomingRequest)

  correlationCache.set(request.params.id, request.payload)

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putTransfersById - END`)
  histTimerEnd({ success: true, fsp: 'payer', operation: 'putTransfersById', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })
  Logger.isPerfEnabled && Logger.perf(`[cid=${request.params.id}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::putTransfersById - END`)
  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.putTransfersByIdError = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putTransfersByIdError - START`)

  Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /payerfsp/transfers/${request.params.id}/error, PAYLOAD: [${JSON.stringify(request.payload)}]`)
  correlationCache.set(request.params.id, request.payload)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }
  callbackCache.set(request.params.id, incomingRequest)

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::putTransfersByIdError - END`)
  histTimerEnd({ success: true, fsp: 'payer', operation: 'putTransfersByIdError', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })
  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.getcorrelationId = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::getcorrelationId - START`)

  const responseData = correlationCache.get(request.params.id)
  Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /payerfsp/correlationid/${request.params.id}, CACHE: [${JSON.stringify(responseData)}]`)

  // Logger.isPerfEnabled && Logger.perf(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payer::getcorrelationId - END`)
  histTimerEnd({ success: true, fsp: 'payer', operation: 'getcorrelationId' })
  return h.response(responseData).code(Enums.Http.ReturnCodes.ACCEPTED.CODE)
}

exports.getRequestById = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  const responseData = requestCache.get(request.params.id)
  Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /payerfsp/requests/${request.params.id}, CACHE: [${JSON.stringify(responseData)}]`)
  requestCache.del(request.params.id)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'getRequestById' })

  return h.response(responseData).code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.getCallbackById = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  const responseData = callbackCache.get(request.params.id)
  Logger.isInfoEnabled && Logger.info(`IN PAYERFSP:: PUT /payerfsp/callbacks/${request.params.id}, CACHE: [${JSON.stringify(responseData)}]`)
  callbackCache.del(request.params.id)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'getCallbackById' })

  return h.response(responseData).code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.putAuthorizations = function (request, h) {
  (async () => {
    Logger.info(`IN PAYERFSP:: PUT /authorizations/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

    const payload = Object.assign({}, request.payload, {
      transferAmount: transferAmount,
      condition: transfersCondition,
      ilpPacket: transfersIlpPacket
    })

    await postTransfers(request, payload)
  })()

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}
