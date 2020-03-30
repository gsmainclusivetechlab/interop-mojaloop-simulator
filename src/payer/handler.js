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
const sendRequest = require('../lib/sendRequest')
const https = require('https')
const Logger = require('@mojaloop/central-services-logger')
const Enums = require('@mojaloop/central-services-shared').Enum
const Metrics = require('../lib/metrics')
const base64url = require('base64url')

const { putTransactionRequest } = require('../transactionRequests/helpers')
const { postTransfers } = require('../postTransfers')

const partiesEndpoint = process.env.PARTIES_ENDPOINT || 'http://localhost:1080'
const quotesEndpoint = process.env.QUOTES_ENDPOINT || 'http://localhost:1080'
const transfersEndpoint = process.env.TRANSFERS_ENDPOINT || 'http://localhost:1080'
const transfersFulfilResponseDisabled = (process.env.TRANSFERS_FULFIL_RESPONSE_DISABLED !== undefined && process.env.TRANSFERS_FULFIL_RESPONSE_DISABLED !== 'false')
const transfersFulfilment = process.env.TRANSFERS_FULFILMENT || 'XoSz1cL0tljJSCp_VtIYmPNw-zFUgGfbUqf69AagUzY'
const transfersCondition = process.env.TRANSFERS_CONDITION || 'HOr22-H3AfTDHrSkPjJtVPRdKouuMkDXTR4ejlQa8Ks'
const transfersIlpPacket = process.env.TRANSFERS_ILPPACKET || 'AQAAAAAAAADIEHByaXZhdGUucGF5ZWVmc3CCAiB7InRyYW5zYWN0aW9uSWQiOiIyZGY3NzRlMi1mMWRiLTRmZjctYTQ5NS0yZGRkMzdhZjdjMmMiLCJxdW90ZUlkIjoiMDNhNjA1NTAtNmYyZi00NTU2LThlMDQtMDcwM2UzOWI4N2ZmIiwicGF5ZWUiOnsicGFydHlJZEluZm8iOnsicGFydHlJZFR5cGUiOiJNU0lTRE4iLCJwYXJ0eUlkZW50aWZpZXIiOiIyNzcxMzgwMzkxMyIsImZzcElkIjoicGF5ZWVmc3AifSwicGVyc29uYWxJbmZvIjp7ImNvbXBsZXhOYW1lIjp7fX19LCJwYXllciI6eyJwYXJ0eUlkSW5mbyI6eyJwYXJ0eUlkVHlwZSI6Ik1TSVNETiIsInBhcnR5SWRlbnRpZmllciI6IjI3NzEzODAzOTExIiwiZnNwSWQiOiJwYXllcmZzcCJ9LCJwZXJzb25hbEluZm8iOnsiY29tcGxleE5hbWUiOnt9fX0sImFtb3VudCI6eyJjdXJyZW5jeSI6IlVTRCIsImFtb3VudCI6IjIwMCJ9LCJ0cmFuc2FjdGlvblR5cGUiOnsic2NlbmFyaW8iOiJERVBPU0lUIiwic3ViU2NlbmFyaW8iOiJERVBPU0lUIiwiaW5pdGlhdG9yIjoiUEFZRVIiLCJpbml0aWF0b3JUeXBlIjoiQ09OU1VNRVIiLCJyZWZ1bmRJbmZvIjp7fX19'
const signature = process.env.MOCK_JWS_SIGNATURE || 'abcJjvNrkyK2KBieDUbGfhaBUn75aDUATNF4joqA8OLs4QgSD7i6EO8BIdy6Crph3LnXnTM20Ai1Z6nt0zliS_qPPLU9_vi6qLb15FOkl64DQs9hnfoGeo2tcjZJ88gm19uLY_s27AJqC1GH1B8E2emLrwQMDMikwQcYvXoyLrL7LL3CjaLMKdzR7KTcQi1tCK4sNg0noIQLpV3eA61kess'

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

  Logger.info(`IN PAYERFSP:: PUT /participants/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }

  callbackCache.set(request.params.id, incomingRequest)
  correlationCache.set(request.params.id, request.payload)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'putParticipantsByTypeId', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

// Section about /parties
exports.postPartiesByTypeAndId = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  Logger.info('IN PAYERFSP:: POST /parties/MSISDN/' + request.params.id, request.payload)

  correlationCache.set(request.params.id, request.payload)

  histTimerEnd({ success: true, fsp: 'payee', operation: 'postPartiesByTypeAndId', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })

  return h.response().code(Enums.Http.ReturnCodes.ACCEPTED.CODE)
}

exports.getPartiesByTypeAndId = function (request, h) {
  (async function () {
    const metadata = `${request.method} ${request.path} ${request.params.id} `
    const url = partiesEndpoint + '/parties/MSISDN/' + request.params.id

    Logger.info((new Date().toISOString()), ['IN PAYERFSP::'], `received: ${metadata}. `)

    try {
      const opts = {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.interoperability.parties+json;version=1.0',
          'FSPIOP-Source': request.headers['fspiop-destination'],
          'FSPIOP-Destination': request.headers['fspiop-source'],
          Date: request.headers.date,
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
        data: JSON.stringify(correlationCache.get(request.params.id))
      }

      Logger.info((new Date().toISOString()), 'Executing PUT', url)

      const response = await sendRequest(url, opts, request.span)

      Logger.info((new Date().toISOString()), 'response: ', response.status)

      if (response.status !== Enums.Http.ReturnCodes.ACCEPTED.CODE) {
        throw new Error('Failed to send. Result:', response)
      }
    } catch (err) {
      Logger.info(['error'], err)
    }
  })()

  return h.response().code(Enums.Http.ReturnCodes.ACCEPTED.CODE)
}

exports.putPartiesByTypeId = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  Logger.info(`IN PAYERFSP:: PUT /parties/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }

  callbackCache.set(request.params.id, incomingRequest)
  correlationCache.set(request.params.id, request.payload)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'putPartiesByTypeId', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.putPartiesByTypeIdAndError = function (request, h) {
  Logger.info((new Date().toISOString()), 'IN PAYERFSP:: PUT /parties/' + request.params.id + '/error', request.payload)

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
      payeeFspFee: {
        amount: '1',
        currency: quotesRequest.amount.currency
      },
      payeeFspCommission: {
        amount: '1',
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

    Logger.info(`IN PAYERFSP:: PUT /quotes/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

    // Saving Incoming request
    const incomingRequest = {
      headers: request.headers,
      data: request.payload
    }

    callbackCache.set(request.params.id, incomingRequest)
    correlationCache.set(request.params.id, request.payload)

    histTimerEnd({ success: true, fsp: 'payer', operation: 'putQuotesById', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })

    // amount to emulate test case "Rejected transaction"
    const INVALID_AMOUNT_VALUE = 10.1
    const isTransferAmountInvalid = parseFloat(request.payload.transferAmount.amount) === INVALID_AMOUNT_VALUE

    if (isTransferAmountInvalid) {
      await putTransactionRequest(request, null, 'REJECTED', false)

      return
    }

    await postTransfers(request)
  })()
  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.putQuotesByIdAndError = function (request, h) {
  Logger.info((new Date().toISOString()), 'IN PAYERFSP:: PUT /quotes/' + request.params.id + '/error', request.payload)
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
exports.postTransfers = async function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  Logger.debug(`[cid=${request.payload.transferId}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ Simulator::api::payee::postTransfers - START`)

  const metadata = `${request.method} ${request.path} ${request.payload.transferId}`

  Logger.info(`IN PAYERFSP:: received: ${metadata}.`)

  if (!transfersFulfilResponseDisabled) {
    // Saving Incoming request
    const incomingRequest = {
      headers: request.headers,
      data: request.payload
    }
    requestCache.set(request.payload.transferId, incomingRequest)

    const url = transfersEndpoint + '/transfers/' + request.payload.transferId
    const fspiopUriHeader = `/transfers/${request.payload.transferId}`
    try {
      const transfersResponse = {
        fulfilment: transfersFulfilment,
        completedTimestamp: new Date().toISOString(),
        transferState: 'COMMITTED'
      }
      const protectedHeader = {
        alg: 'RS256',
        'FSPIOP-Source': `${request.headers['fspiop-destination']}`,
        'FSPIOP-Destination': `${request.headers['fspiop-source']}`,
        'FSPIOP-URI': `/transfers/${request.payload.transferId}`,
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
          'Content-Type': 'application/vnd.interoperability.transfers+json;version=1.0',
          'FSPIOP-Source': request.headers['fspiop-destination'],
          'FSPIOP-Destination': request.headers['fspiop-source'],
          Date: new Date().toUTCString(),
          'FSPIOP-Signature': JSON.stringify(fspiopSignature),
          'FSPIOP-HTTP-Method': 'PUT',
          'FSPIOP-URI': fspiopUriHeader,
          traceparent: request.headers.traceparent ? request.headers.traceparent : undefined,
          tracestate: request.headers.tracestate ? request.headers.tracestate : undefined
        },
        data: JSON.stringify(transfersResponse)
      }

      Logger.info(`Executing PUT: [${url}], HEADERS: [${JSON.stringify(opts.headers)}], BODY: [${JSON.stringify(transfersResponse)}]`)

      const response = await sendRequest(url, opts, request.span)

      Logger.info(`response: ${response.status}`)

      if (response.status !== Enums.Http.ReturnCodes.ACCEPTED.CODE) {
        throw new Error(`Failed to send. Result: ${JSON.stringify(response)}`)
      }
      histTimerEnd({
        success: true,
        fsp: 'payee',
        operation: 'postTransfers',
        source: request.headers['fspiop-source'],
        destination: request.headers['fspiop-destination']
      })
    } catch (err) {
      Logger.error(err)

      histTimerEnd({
        success: false,
        fsp: 'payee',
        operation: 'postTransfers',
        source: request.headers['fspiop-source'],
        destination: request.headers['fspiop-destination']
      })
    }
  } else {
    histTimerEnd({
      success: true,
      fsp: 'payee',
      operation: 'postTransfers',
      source: request.headers['fspiop-source'],
      destination: request.headers['fspiop-destination']
    })
  }

  return h.response().code(Enums.Http.ReturnCodes.ACCEPTED.CODE)
}

exports.putTransfersById = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  Logger.info(`IN PAYERFSP:: PUT /transfers/${request.params.id}, PAYLOAD: [${JSON.stringify(request.payload)}]`)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }

  callbackCache.set(request.params.id, incomingRequest)
  correlationCache.set(request.params.id, request.payload)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'putTransfersById', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.putTransfersByIdError = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  Logger.info(`IN PAYERFSP:: PUT /transfers/${request.params.id}/error, PAYLOAD: [${JSON.stringify(request.payload)}]`)

  correlationCache.set(request.params.id, request.payload)

  // Saving Incoming request
  const incomingRequest = {
    headers: request.headers,
    data: request.payload
  }

  callbackCache.set(request.params.id, incomingRequest)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'putTransfersByIdError', source: request.headers['fspiop-source'], destination: request.headers['fspiop-destination'] })

  return h.response().code(Enums.Http.ReturnCodes.OK.CODE)
}

exports.getCorrelationId = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  Logger.info(`IN PAYERFSP:: PUT /correlationid/${request.params.id}, CACHE: [${JSON.stringify(correlationCache.get(request.params.id))}]`)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'getCorrelationId' })

  return h.response(correlationCache.get(request.params.id)).code(Enums.Http.ReturnCodes.ACCEPTED.CODE)
}

exports.getRequestById = function (request, h) {
  const histTimerEnd = Metrics.getHistogram(
    'sim_request',
    'Histogram for Simulator http operations',
    ['success', 'fsp', 'operation', 'source', 'destination']
  ).startTimer()

  Logger.info(`IN PAYERFSP:: PUT /requests/${request.params.id}, CACHE: [${JSON.stringify(requestCache.get(request.params.id))}]`)

  const responseData = requestCache.get(request.params.id)
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

  Logger.info(`IN PAYERFSP:: PUT /callbacks/${request.params.id}, CACHE: [${JSON.stringify(callbackCache.get(request.params.id))}]`)

  const responseData = callbackCache.get(request.params.id)
  callbackCache.del(request.params.id)

  histTimerEnd({ success: true, fsp: 'payer', operation: 'getCallbackById' })

  return h.response(responseData).code(Enums.Http.ReturnCodes.OK.CODE)
}
