'use strict';

const request = require('axios');
const xml2js = require('xml2js');

module.exports = {

  // SOAP related data

  ACTIONS_TEMPLATES: require('./Soap-Actions.json'),
  ERROR_CODES: require('./Soap-Error-Codes.json'),
  SERVIC_IDS: require('./Service-Ids.json'),

  // SOAP related functions

  /** Encodes special XML characters.
  * @param  {String} xmlData orignal XML data
  * @return {String} data without any <, >, &, ', "
  */

  encodeXml: (xmlData) => {
    return xmlData.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  },

  /** Sends a http request in SOAP format to specific player.
  * @param  {String} baseUrl http address including port e.g 'http://192.168.178.30:1400'
  * @param  {String} path SOAP endpoint e. g. '/MediaRenderer/RenderingControl/Control'
  * @param  {String} name e.g. 'RenderingControl'
  * @param  {String} action e.g 'SetEQ'
  * @param  {Object} args e.g.  { InstanceID: 0, EQType: '' },
  * @return {promise} with response from player
  */
  sendToPlayer: (baseUrl, path, name, action, args) => {
    console.log('start send to player');

    // create header data
    const messageAction = `"urn:schemas-upnp-org:service:${name}:1#${action}"`;

    // create body data
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
    return new Promise((resolve, reject) => {
      request({
        method: 'post',
        baseURL: baseUrl,
        url: path,
        headers: {
          SOAPAction: messageAction,
          'Content-type': 'text/xml; charset=utf8'
        },
        data: messageBody
      }).then((response) => {
        resolve({
          headers: response.headers,
          body: response.data,
          statusCode: response.status
        });
      }).catch((error) => {
        console.error(`request failed: ${error}`);
        // In case of an SOAP error error.reponse helds the details.
        // That goes usually together with status code 500 - triggering catch
        // Experience: When using reject(error) the error.reponse get lost.
        // Thats why error.response is checked and handled here!
        let myError;
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
            myError = new Error('upnp: statusCode 500 & upnpErrorCode ' + errorCode);
            reject(myError);
          } else {
            myError = new Error('upnp: ' + error.message + '///' + error.response.data);
            reject(myError);
          }
        } else {
          reject(error);
        }
      });
    });
  },

  /** Sends a http request in SOAP format to specific player.
  * @param  {String} baseUrl http address including port e.g 'http://192.168.178.30:1400'
  * @param  {String} path SOAP endpoint e. g. '/MediaRenderer/RenderingControl/Control'
  * @param  {String} name e.g. 'RenderingControl'
  * @param  {String} action e.g 'SetEQ'
  * @param  {Object} args e.g.  { InstanceID: 0, EQType: '' },
  * @return {promise} with response from player
  */
  sendToPlayerV1: async function (baseUrl, path, name, action, args) {
    // create header data
    const messageAction = `"urn:schemas-upnp-org:service:${name}:1#${action}"`;

    // create body data
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
            console.log(JSON.stringify(this.parseSoapBody(data)));
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

  /** Extract list with title, albumArt, uri and metadata from given input
  * @param  {Object} body response from SONOS player on a SOAP request
  * @return {promise} JSON format
  */
  parseBrowseFavoritesResults: async function (body) {
    // clean xml: masked apostrophe

    // TODO error handling, empty list,...
    const cleanXML = body.replace('\\"', '');
    const result = await xml2js.parseStringPromise(cleanXML, { mergeAttrs: true, explicitArray: false, charkey: 'chartag' });
    const list = [];
    const original = result['DIDL-Lite'].item;
    for (var i = 0; i < original.length; i++) {
      list.push({ title: original[i]['dc:title'], albumArt: original[i]['upnp:albumArtURI'], uri: original[i].res.chartag, metaData: original[i]['r:resMD'] });
    }
    return list;
  },

  /** parseSoapBody transforms soap response to simple JSON format
  * @param  {Object} body response from SONOS player on a SOAP request
  * @return {promise} JSON format
  */
  parseSoapBody: (body) => {
    return xml2js.parseStringPromise(body, { mergeAttrs: true, explicitArray: false });
  }

};
