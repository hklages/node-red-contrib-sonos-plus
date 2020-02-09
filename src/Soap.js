'use strict';

const request = require('axios');
const xml2js = require('xml2js');

module.exports = {

  // SOAP related data

  SOAP_ACTION_TEMPLATE: { // provides all relevant SOAP information for given action
    setEq: {
      path: '/MediaRenderer/RenderingControl/Control',
      name: 'RenderingControl',
      action: 'SetEQ',
      setOptions: { InstanceID: 0, EQType: '', DesiredValue: '' },
      eqTypeValues: ['DialogLevel', 'NightMode', 'SubGain'],
      info: 'Set: EQType and DesiredValue have to be defined. DesiredValue depend on EQType'
    },
    getEq: {
      path: '/MediaRenderer/RenderingControl/Control',
      name: 'RenderingControl',
      action: 'SetEQ',
      getOptions: { InstanceID: 0, EQType: '' },
      eqTypeValues: ['DialogLevel', 'NightMode', 'SubGain'],
      info: 'Set: EQType and DesiredValue have to be defined. DesiredValue depend on EQType'
    },
    setCrossfademode: {
      path: '/MediaRenderer/AVTransport/Control',
      name: 'AVTransport',
      action: 'SetCrossfadeMode',
      options: { InstanceID: 0, CrossfadeMode: '' },
      info: 'Set CrosfadeMode value has to be defined, value 0 or 1'
    },
    getCrossfademode: {
      path: '/MediaRenderer/AVTransport/Control',
      name: 'AVTransport',
      action: 'GetCrossfadeMode',
      options: { InstanceID: 0 },
      info: 'will return 0 or 1'
    },
    configureSleepTimer: {
      path: '/MediaRenderer/AVTransport/Control',
      name: 'AVTransport',
      action: 'ConfigureSleepTimer',
      options: { InstanceID: 0, NewSleepTimerDuration: '' },
      optionsValueName: 'NewSleepTimerDuration',
      dataType: 'string',
      responsePath: ['s:Envelope', 's:Body', 'u:ConfigureSleepTimerResponse', 'xmlns:u'],
      responseValue: 'urn:schemas-upnp-org:service:AVTransport:1',
      info: 'Duration in format hh:mm:ss'
    },
    getRemainingSleepTimerDuration: {
      path: '/MediaRenderer/AVTransport/Control',
      name: 'AVTransport',
      action: 'GetRemainingSleepTimerDuration',
      options: { InstanceID: 0 },
      responsePath: ['s:Envelope', 's:Body', 'u:GetRemainingSleepTimerDurationResponse', 'RemainingSleepTimerDuration'],
      dataType: 'string',
      info: 'returns duration in format hh:mm:ss.'
    }
  },

  // SOAP related functions

  /** sendToPlayer sends a http request in SOAP format to specific player.
  * @param  {Object} functionParameters object
  *           {String} baseUrl http address including property e.g 'http://192.168.178.30:1400'
  *           {String} path the path (SOAP endpoint) e. g. '/MediaRenderer/RenderingControl/Control'
  *           {String} name e.g. 'RenderingControl'
  *           {String} action e.g 'SetEQ'
  *           {Object} options e.g.  { InstanceID: 0, EQType: '' },
  * @return {promise}
  */
  sendToPlayer: (functionParameters = {
    baseUrl: '',
    path: '',
    name: '',
    action: '',
    options: {}
  }) => {
    // setting default, overwrite with given parameter
    const { baseUrl, path, name, action, options = { InstanceID: 0 } } = functionParameters;

    // create header data
    const messageAction = `"urn:schemas-upnp-org:service:${name}:1#${action}"`;

    // create body data
    let messageBody = `<u:${action} xmlns:u="urn:schemas-upnp-org:service:${name}:1">`;
    if (options) {
      Object.keys(options).forEach(key => {
        messageBody += `<${key}>${options[key]}</${key}>`;
      });
    }
    messageBody += `</u:${action}>`;
    messageBody = [// '<?xml version="1.0" encoding="utf-8"?>',
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
      '<s:Body>' + messageBody + '</s:Body>',
      '</s:Envelope>'].join('');

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
        if (error.response) {
          console.error(`request failed: ${error}`);
          reject(error.response.data);
        } else {
          console.error(`request failed: ${error}`);
          reject(error);
        }
      });
    });
  },

  /** parseSoapBody transforms soap response to simple JSON format
  * @param  {Object} body response from SONOS player on a SOAP request
  * @return {promise} JSON format
  */
  parseSoapBody: (body) => {
    return xml2js.parseStringPromise(body, { mergeAttrs: true, explicitArray: false });
  }

};
