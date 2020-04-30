'use strict'
const request = require('axios')
const xml2js = require('xml2js')

const { isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, getErrorCodeFromEnvelope, getErrorMessageV1 } = require('./Helper.js')

module.exports = {
  // SOAP related data

  ERROR_CODES: require('./Soap-Error-Codes.json'),

  // ========================================================================
  //
  //                        SOAP related functions
  //
  // ========================================================================

  /** Send http request in SOAP format to specified player.
   * @param  {string} baseUrl http address including http prefix and port e.g 'http://192.168.178.30:1400'
   * @param  {string} path SOAP endpoint e. g. '/MediaRenderer/RenderingControl/Control'
   * @param  {string} name e.g. 'RenderingControl'
   * @param  {string} action e.g 'SetEQ'
   * @param  {object} args e.g.  { InstanceID: 0, EQType: '' },
   *
   * @return {promise} response from player
   */
  sendToPlayerV1: async function (baseUrl, path, name, action, args) {
    console.log('sendToPlayer1. Action >>' + action) // please leave for debugging
    // create action used in header
    const messageAction = `"urn:schemas-upnp-org:service:${name}:1#${action}"`

    // create body
    let messageBody = `<u:${action} xmlns:u="urn:schemas-upnp-org:service:${name}:1">`
    if (args) {
      Object.keys(args).forEach(key => {
        messageBody += `<${key}>${args[key]}</${key}>`
      })
    }
    messageBody += `</u:${action}>`
    messageBody = [
      // '<?xml version="1.0" encoding="utf-8"?>',
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
      '<s:Body>' + messageBody + '</s:Body>',
      '</s:Envelope>'
    ].join('')

    const response = await request({
      method: 'post',
      baseURL: baseUrl,
      url: path,
      headers: {
        SOAPAction: messageAction,
        'Content-type': 'text/xml; charset=utf8'
      },
      data: messageBody
    })
      .catch((error) => {
        // In case of an SOAP error error.reponse helds the details.
        // That goes usually together with status code 500 - triggering catch
        // Experience: When using reject(error) the error.reponse get lost.
        // Thats why error.response is checked and handled here!
        console.log('sendToPlayerV1. entering catch error') // please leave for debugging
        if (isValidProperty(error, ['response'])) {
        // Indicator for SOAP Error
          if (isValidProperty(error, ['message'])) {
            if (error.message.startsWith('Request failed with status code 500')) {
              const errorCode = getErrorCodeFromEnvelope(error.response.data)
              let serviceErrorList = ''
              if (isValidPropertyNotEmptyString(module.exports.ERROR_CODES, [name.toUpperCase()])) {
                // look up in the service specific error codes 7xx
                serviceErrorList = module.exports.ERROR_CODES[name.toUpperCase()]
              }
              const errorMessage = getErrorMessageV1(errorCode, module.exports.ERROR_CODES.UPNP, serviceErrorList)
              console.log('sendToPlayerV1.  status code 500 errorCode >>' + JSON.stringify(errorCode)) // please leave for debugging
              throw new Error(`n-r-c-s-p: statusCode 500 & upnpErrorCode ${errorCode}. upnpErrorMessage >>${errorMessage}`)
            } else {
              console.log('error.message is not code 500  >>' + JSON.stringify(error.message)) // please leave for debugging
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
   * @return {string} error text (from mapping code -  text)
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

  /** Encodes special XML characters e. g. < to &lt.
   * @param  {string} xmlData orignal XML data
   * @return {string} data without any <, >, &, ', "
   * All params must exist!
   */

  encodeXml: xmlData => {
    return xmlData.replace(/[<>&'"]/g, singleChar => {
      switch (singleChar) {
        case '<':
          return '&lt;'
        case '>':
          return '&gt;'
        case '&':
          return '&amp;'
        case "'":
          return '&apos;'
        case '"':
          return '&quot;'
      }
    })
  },

  /** Transforms soap response to JSON format.
   * @param  {object} body response from SONOS player on a SOAP request
   * @param  {string} [tag] tag string, not used if empty
   *
   * @return {promise} JSON format
   */

  // documentation: https://www.npmjs.com/package/xml2js#options
  // explicitArray (default: true):
  //    Always put child nodes in an array if true; otherwise an array is created only if there is more than one.
  // mergeAttrs (default: false): Merge attributes and child elements as properties of the parent,
  //    instead of keying attributes off a child attribute object.This option is ignored if ignoreAttrs is true
  // charkey (default: _):
  //    Prefix that is used to access the character content.Version 0.1 default was #.

  parseSoapBodyV1: async function (body, tag) {
    const arg = { mergeAttrs: true, explicitArray: false }
    if (tag !== '') {
      arg.charkey = tag
    }
    return xml2js.parseStringPromise(body, arg)
  }
}
