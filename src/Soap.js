'use strict';
const request = require('axios');
const xml2js = require('xml2js');

module.exports = {

  // SOAP related data

  ERROR_CODES: require('./Soap-Error-Codes.json'),

  // SOAP related functions

  /** Sends a http request in SOAP format to specified player.
  * @param  {string} baseUrl http address including http prefix and port e.g 'http://192.168.178.30:1400'
  * @param  {string} path SOAP endpoint e. g. '/MediaRenderer/RenderingControl/Control'
  * @param  {string} name e.g. 'RenderingControl'
  * @param  {string} action e.g 'SetEQ'
  * @param  {object} args e.g.  { InstanceID: 0, EQType: '' },
  * @returns {promise} with response from player
  */
  sendToPlayerV1: async function (baseUrl, path, name, action, args) {
    // create header
    const messageAction = `"urn:schemas-upnp-org:service:${name}:1#${action}"`;

    // create body
    let messageBody = `<u:${action} xmlns:u="urn:schemas-upnp-org:service:${name}:1">`;
    if (args) {
      Object.keys(args).forEach(key => {
        messageBody += `<${key}>${args[key]}</${key}>`;
      });
    }
    messageBody += `</u:${action}>`;
    messageBody = [// '<?xml version="1.0" encoding="utf-8"?>',
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
      '<s:Body>' + messageBody + '</s:Body>',
      '</s:Envelope>'].join('');

    console.log('start axio request');
    try {
      const response = await request({
        method: 'post',
        baseURL: baseUrl,
        url: path,
        headers: {
          SOAPAction: messageAction,
          'Content-type': 'text/xml; charset=utf8'
        },
        data: messageBody
      });
      console.log('request: success');
      return {
        headers: response.headers,
        body: response.data,
        statusCode: response.status
      };
    } catch (error) {
      console.log(`request failed: ${error}`);
      // In case of an SOAP error error.reponse helds the details.
      // That goes usually together with status code 500 - triggering catch
      // Experience: When using reject(error) the error.reponse get lost.
      // Thats why error.response is checked and handled here!
      if (error.response) { // Indicator for SOAP Error
        if (error.message.startsWith('Request failed with status code 500')) {
          const errorCode = ((data) => {
            // TODO check '' and xml parser to get value
            const start = data.indexOf('<errorCode>');
            if (start > 0) {
              const end = data.indexOf('</errorCode>');
              return data.substring(start + '<errorCode>'.length, end);
            } else {
              return '';
            }
          })(error.response.data);
          throw new Error('upnp: statusCode:500 & upnpErrorCode:' + errorCode);
        } else {
          throw new Error('upnp: ' + error.message + '///' + error.response.data);
        }
      } else {
        throw error;
      }
    }
  },

  /** Encodes special XML characters e. g. < to &lt.
  * @param  {string} xmlData orignal XML data
  * @returns {string} data without any <, >, &, ', "
  */

  encodeXml: (xmlData) => {
    return xmlData.replace(/[<>&'"]/g, (singleChar) => {
      switch (singleChar) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  },

  /** Transforms soap response to JSON format.
  * @param  {object} body response from SONOS player on a SOAP request
  * @param  {string} charTag tag string, not used if empty
  * @returns {promise} JSON format
  */
  parseSoapBodyV1: (body, charTag) => {
    if (charTag === '') {
      return xml2js.parseStringPromise(body, { mergeAttrs: true, explicitArray: false });
    } else {
      xml2js.parseStringPromise(body, { mergeAttrs: true, explicitArray: false, charkey: charTag });
    }
  }
};
