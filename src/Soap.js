/**
 * Collection of SOAP protocol and axios related functions doing the basic SOAP stuff such as 
 * creating envelopes, sending data to player via POST and handles the response.
 *
 * @module Soap
 * 
 * @author Henning Klages
 * 
 * @since 2020-12-16
*/

'use strict'

const {
  isValidProperty, isValidPropertyNotEmptyString, getErrorCodeFromEnvelope, getErrorMessageV1,
  NRCSP_PREFIX
} = require('./Helper.js')

const request = require('axios')
const debug = require('debug')('nrcsp:Soap')

module.exports = {

  SOAP_ERRORS: require('./Db-Soap-Errorcodes.json'),

  /** Send http request in SOAP format to player.
   * @param {string} playerUrlOrigin JavaScript URL origin such as http://192.168.178.37:1400
   * @param {string} endpoint SOAP endpoint (URL pathname) such '/ZoneGroupTopology/Control'
   * @param {string} serviceName such as 'ZoneGroupTopology'
   * @param {string} actionName such as 'GetZoneGroupState'
   * @param {object} args such as { InstanceID: 0, EQType: "NightMode" } or just {}
   *
   * @returns {promise} response header/body/error code from player
   */
  sendSoapToPlayer: async function (playerUrlOrigin, endpoint, serviceName, actionName, args) {
    debug('entering method sendSoapToPlayer')
    // create action used in header - notice the " inside
    const soapAction = `"urn:schemas-upnp-org:service:${serviceName}:1#${actionName}"`

    // create body
    let httpBody = `<u:${actionName} xmlns:u="urn:schemas-upnp-org:service:${serviceName}:1">`
    if (args) {
      Object.keys(args).forEach(key => {
        httpBody += `<${key}>${args[key]}</${key}>`
      })
    }
    httpBody += `</u:${actionName}>`

    // body wrapped in envelope
    // eslint-disable-next-line max-len
    httpBody = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' 
      + '<s:Body>' + httpBody + '</s:Body>'
      + '</s:Envelope>'
    debug('soa action >>%s', JSON.stringify(soapAction))
    debug('soap body >>%s', JSON.stringify(httpBody))
    const response = await request({
      method: 'post',
      baseURL: playerUrlOrigin,
      url: endpoint,
      headers: {
        SOAPAction: soapAction,
        'Content-type': 'text/xml; charset=utf8'
      },
      data: httpBody
    })
      .catch((error) => {
        // Experience: When using reject(error) the error.response get lost.
        // Thats why error.response is checked and handled here!
        // In case of an SOAP error error.response held the details and status code 500
        if (isValidProperty(error, ['response'])) {
        // Indicator for SOAP Error
          if (isValidProperty(error, ['message'])) {
            if (error.message.startsWith('Request failed with status code 500')) {
              const errorCode = getErrorCodeFromEnvelope(error.response.data)
              let serviceErrorList = ''
              // eslint-disable-next-line max-len
              if (isValidPropertyNotEmptyString(module.exports.SOAP_ERRORS, [serviceName.toUpperCase()])) {
                // look up in the service specific error codes 7xx
                serviceErrorList = module.exports.SOAP_ERRORS[serviceName.toUpperCase()]
              }
              const errorMessage
                = getErrorMessageV1(errorCode, module.exports.SOAP_ERRORS.UPNP, serviceErrorList)
              // eslint-disable-next-line max-len
              throw new Error(`${NRCSP_PREFIX} statusCode 500 & upnpErrorCode ${errorCode}. upnpErrorMessage >>${errorMessage}`)
            } else {
              // eslint-disable-next-line max-len
              throw new Error('error.message is not code 500' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
            }
          } else {
            // eslint-disable-next-line max-len
            throw new Error('error.message is missing. error >>' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
          }
        } else {
          // usually ECON.. or timed out. Is being handled in failure procedure
          // eslint-disable-next-line max-len
          debug('error without error.response >>%s', JSON.stringify(error, Object.getOwnPropertyNames(error)))
          throw error
        }
      })
    return {
      headers: response.headers,
      body: response.data,
      statusCode: response.status
    }
  }
}
