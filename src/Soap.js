'use strict'
const request = require('axios')
const xml2js = require('xml2js')

const { isValidProperty, isTruthyAndNotEmptyString } = require('./Helper.js')

module.exports = {
  // SOAP related data

  ERROR_CODES: require('./Soap-Error-Codes.json'),

  // SOAP related functions

  /** Send http request in SOAP format to specified player.
   * @param  {string} baseUrl http address including http prefix and port e.g 'http://192.168.178.30:1400'
   * @param  {string} path SOAP endpoint e. g. '/MediaRenderer/RenderingControl/Control'
   * @param  {string} name e.g. 'RenderingControl'
   * @param  {string} action e.g 'SetEQ'
   * @param  {object} args e.g.  { InstanceID: 0, EQType: '' },
   * @returns {promise} with response from player
   * All  parameters are required except args.
   */
  sendToPlayerV1: async function (baseUrl, path, name, action, args) {
    // create header
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
        console.log(`request failed: ${error}`)
        // In case of an SOAP error error.reponse helds the details.
        // That goes usually together with status code 500 - triggering catch
        // Experience: When using reject(error) the error.reponse get lost.
        // Thats why error.response is checked and handled here!
        if (error.response) {
        // Indicator for SOAP Error
          if (error.message.startsWith('Request failed with status code 500')) {
            const errorCode = module.exports.getErrorCode(error.response.data)
            console.log(name)
            const errorMessage = module.exports.getErrorMessage(errorCode, name)
            console.log('errormessage >>' + errorMessage)
            throw new Error(
              'n-r-c-s-p: statusCode >>500 & upnpErrorCode >>' +
              errorCode +
              ' upnpErrorMessage >>' +
              errorMessage
            )
          } else {
            throw new Error('n-r-c-s-p: ' + error.message + '///' + error.response.data)
          }
        } else {
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
   * @param  {string} actionName
   * @return {string} error message
   * All parameters are required!
   */

  getErrorMessage: (errorCode, actionName) => {
    const defaultMessage = ''
    if (isTruthyAndNotEmptyString(errorCode)) {
      if (isValidProperty(module.exports.ERROR_CODES, [actionName.toUpperCase()])) {
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
      return defaultMessage
    } else {
      return defaultMessage
    }
  },

  /**  Get error code. If not found provide empty string.
   * @param  {string} data  must exist!
   * @return {string} error message
   * data is required.
   * prereq: xml  contains tag <errorCode>
   */

  getErrorCode: data => {
    let errorCode = '' // default
    if (isTruthyAndNotEmptyString(data)) {
      const positionStart = data.indexOf('<errorCode>') + '<errorCode>'.length
      const positionEnd = data.indexOf('</errorCode>')
      if (positionStart > 1 && positionEnd > positionStart) {
        errorCode = data.substring(positionStart, positionEnd)
      }
    }
    return errorCode.trim()
  },

  /** Encodes special XML characters e. g. < to &lt.
   * @param  {string} xmlData orignal XML data
   * @returns {string} data without any <, >, &, ', "
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
   * @param  {string} tag tag string, not used if empty
   * @returns {promise} JSON format
   * All params must exist!
   */
  parseSoapBodyV1: async function (body, tag) {
    const arg = { mergeAttrs: true, explicitArray: false }

    if (tag !== '') {
      arg.charkey = tag
    }
    return xml2js.parseStringPromise(body, arg)
  }
}
