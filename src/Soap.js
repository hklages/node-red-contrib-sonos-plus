'use strict'

/**
 * Collection of SOAP protocol related functions doing the basic SOAP stuff such as creating envelopes, sending data to player 
 * via POST and handles the response.
 *
 * @module Soap
 * 
 * @author Henning Klages
 * 
 * @since 2020-11-08
*/

const request = require('axios')

const { isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, getErrorCodeFromEnvelope, getErrorMessageV1, NRCSP_ERRORPREFIX } = require('./Helper.js')

module.exports = {

  ERROR_CODES: require('./Db-Soap-Errorcodes.json'),

  // ========================================================================
  //
  //                        SOAP related functions for SONOS player
  //
  // ========================================================================

  /** Send http request in SOAP format to specified player.
   * @param  {string} baseUrl http address including http prefix and port such as 'http://192.168.178.30:1400'
   * @param  {string} endpoint SOAP endpoint such as '/MediaRenderer/RenderingControl/Control'
   * @param  {string} serviceName such as 'RenderingControl'
   * @param  {string} actionIdentifier such as 'GetEQ'
   * @param  {object} args such as { InstanceID: 0, EQType: "NightMode" },
   *
   * @returns{promise} response header/body/error code from player
   */
  sendToPlayerV1: async function (baseUrl, endpoint, serviceName, actionIdentifier, args) {
    // create action used in header - notice the " inside `
    const soapAction = `"urn:schemas-upnp-org:service:${serviceName}:1#${actionIdentifier}"`

    // create body
    let httpBody = `<u:${actionIdentifier} xmlns:u="urn:schemas-upnp-org:service:${serviceName}:1">`
    if (args) {
      Object.keys(args).forEach(key => {
        httpBody += `<${key}>${args[key]}</${key}>`
      })
    }
    httpBody += `</u:${actionIdentifier}>`

    // body wrapped in envelope
    httpBody = [
      // '<?xml version="1.0" encoding="utf-8"?>',
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
      '<s:Body>' + httpBody + '</s:Body>',
      '</s:Envelope>'
    ].join('')

    const response = await request({
      method: 'post',
      baseURL: baseUrl,
      url: endpoint,
      headers: {
        SOAPAction: soapAction,
        'Content-type': 'text/xml; charset=utf8'
      },
      data: httpBody
    })
      .catch((error) => {
        // In case of an SOAP error error.reponse helds the details.
        // That goes usually together with status code 500 - triggering catch
        // Experience: When using reject(error) the error.reponse get lost.
        // Thats why error.response is checked and handled here!
        if (isValidProperty(error, ['response'])) {
        // Indicator for SOAP Error
          if (isValidProperty(error, ['message'])) {
            if (error.message.startsWith('Request failed with status code 500')) {
              const errorCode = getErrorCodeFromEnvelope(error.response.data)
              let serviceErrorList = ''
              if (isValidPropertyNotEmptyString(module.exports.ERROR_CODES, [serviceName.toUpperCase()])) {
                // look up in the service specific error codes 7xx
                serviceErrorList = module.exports.ERROR_CODES[serviceName.toUpperCase()]
              }
              const errorMessage = getErrorMessageV1(errorCode, module.exports.ERROR_CODES.UPNP, serviceErrorList)
              throw new Error(`${NRCSP_ERRORPREFIX} statusCode 500 & upnpErrorCode ${errorCode}. upnpErrorMessage >>${errorMessage}`)
            } else {
              throw new Error('error.message is not code 500' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
            }
          } else {
            throw new Error('error.message is missing. error >>' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
          }
        } else {
          // usually ECON.. or timed out. Is being handled in failure procedure
          throw error
        }
      })
    return {
      headers: response.headers,
      body: response.data,
      statusCode: response.status
    }
  },

  /**  Get error message from error code. If not found provide empty string.
   * @param  {string} errorCode
   * @param  {string} [actionName] '' is
   *
   * @returns{string} error text (from mapping code -  text)
   */

  getUpnpErrorMessage: (errorCode, actionName) => {
    const errorText = 'unknown error' // default
    if (isTruthyAndNotEmptyString(errorCode)) {
      if (isValidPropertyNotEmptyString(module.exports.ERROR_CODES, [actionName.toUpperCase()])) {
        // look up in the service specific error codes 7xx
        const actionErrorList = module.exports.ERROR_CODES[actionName.toUpperCase()]
        for (let i = 0; i < actionErrorList.length; i++) {
          if (actionErrorList[i].code === errorCode) {
            return actionErrorList[i].message
          }
        }
      }
      const npnpErrorList = module.exports.ERROR_CODES.UPNP
      for (let i = 0; i < npnpErrorList.length; i++) {
        if (npnpErrorList[i].code === errorCode) {
          return npnpErrorList[i].message
        }
      }
    }
    return errorText
  },

  /** Encodes special XML characters such as < to &lt;.
   * @param  {string} xmlData orignal XML data
   * @returns{string} data without any <, >, &, ', "
   */

  encodeXml: xmlData => {
    return xmlData.replace(/[<>&'"]/g, singleChar => {
      switch (singleChar) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"':  return '&quot;'
      }
    })
  }
}
