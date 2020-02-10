'use strict';

const request = require('axios');
const xml2js = require('xml2js');

module.exports = {

  // SOAP related data

  SOAP_ACTION_TEMPLATE: { // provides all relevant SOAP information for given action

    setEQ: {
      path: '/MediaRenderer/RenderingControl/Control',
      name: 'RenderingControl',
      action: 'SetEQ',
      optionsValueName: '', // not used because 2 TODO use as array or forget
      dataType: 'string / string / integer', // not used
      options: { InstanceID: 0, EQType: 'DialogLevel', DesiredValue: '1' },
      eqTypeValues: ['DialogLevel', 'NightMode', 'SubGain'],
      responsePath: ['s:Envelope', 's:Body', 'u:SetEQResponse', 'xmlns:u'],
      responseValue: 'urn:schemas-upnp-org:service:RenderingControl:1',
      info: 'Set EQType and DesiredValue have to be defined. DesiredValue depend on EQType'
    },

    getEQ: {
      path: '/MediaRenderer/RenderingControl/Control',
      name: 'RenderingControl',
      action: 'GetEQ',
      options: { InstanceID: 0, EQType: 'DialogLevel' },
      eqTypeValues: ['DialogLevel', 'NightMode', 'SubGain'],
      responsePath: ['s:Envelope', 's:Body', 'u:GetEQResponse', 'CurrentValue'],
      info: 'EQType have to be defined. Current value 0|1 or -15 to 15 for SubGain'
    },

    setCrossfadeMode: {
      path: '/MediaRenderer/AVTransport/Control',
      name: 'AVTransport',
      action: 'SetCrossfadeMode',
      optionsValueName: 'CrossfadeMode',
      dataType: 'string', // not used
      options: { InstanceID: 0, CrossfadeMode: '1' },
      responsePath: ['s:Envelope', 's:Body', 'u:SetCrossfadeModeResponse', 'xmlns:u'],
      responseValue: 'urn:schemas-upnp-org:service:AVTransport:1',
      info: 'Set CrossfadeMode 0 or 1'
    },

    getCrossfadeMode: {
      path: '/MediaRenderer/AVTransport/Control',
      name: 'AVTransport',
      action: 'GetCrossfadeMode',
      options: { InstanceID: 0 },
      responsePath: ['s:Envelope', 's:Body', 'u:GetCrossfadeModeResponse', 'CrossfadeMode'],
      info: 'will return 0 or 1 and might be converted to On Off'
    },

    configureSleepTimer: {
      path: '/MediaRenderer/AVTransport/Control',
      name: 'AVTransport',
      action: 'ConfigureSleepTimer',
      optionsValueName: 'NewSleepTimerDuration',
      dataType: 'string', // not used
      options: { InstanceID: 0, NewSleepTimerDuration: '00:05:00' },
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
      info: 'returns duration in format hh:mm:ss - if empty string means no timer'
    }
  },

  SOAP_ERROR_CODES: [ // from https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-dtag/b7a8430b-d621-40e7-a591-dbfb60244e3f
    { code: 401, message: 'Invalid Action' },
    { code: 402, messsage: 'Invalid Args' },
    { code: 403, message: 'Out of Sync' },
    { code: 501, message: 'Action Failed' },
    { code: 801, message: 'Invalid Endpoint' },
    { code: 802, message: 'Invalid Certificate' },
    { code: 803, message: 'Invalid Nonce (authentication)' }
  ],

  SONOS_ERROR_CODES: { // from https://raw.githubusercontent.com/tkugelberg/SymconSonos/master/Sonos/sonosAccess.php
    '/MediaRenderer/AVTransport/Control': [
      { code: 701, message: 'ERROR_AV_UPNP_AVT_INVALID_TRANSITION' },
      { code: 702, message: 'ERROR_AV_UPNP_AVT_NO_CONTENTS' },
      { code: 703, message: 'ERROR_AV_UPNP_AVT_READ_ERROR' },
      { code: 704, message: 'ERROR_AV_UPNP_AVT_UNSUPPORTED_PLAY_FORMAT' },
      { code: 705, message: 'ERROR_AV_UPNP_AVT_TRANSPORT_LOCKED' },
      { code: 706, message: 'ERROR_AV_UPNP_AVT_WRITE_ERROR' },
      { code: 707, message: 'ERROR_AV_UPNP_AVT_PROTECTED_MEDIA' },
      { code: 708, message: 'ERROR_AV_UPNP_AVT_UNSUPPORTED_REC_FORMAT' },
      { code: 709, message: 'ERROR_AV_UPNP_AVT_FULL_MEDIA' },
      { code: 710, message: 'ERROR_AV_UPNP_AVT_UNSUPPORTED_SEEK_MODE' },
      { code: 711, message: 'ERROR_AV_UPNP_AVT_ILLEGAL_SEEK_TARGET' },
      { code: 712, message: 'ERROR_AV_UPNP_AVT_UNSUPPORTED_PLAY_MODE' },
      { code: 713, message: 'ERROR_AV_UPNP_AVT_UNSUPPORTED_REC_QUALITY' },
      { code: 714, message: 'ERROR_AV_UPNP_AVT_ILLEGAL_MIME' },
      { code: 715, message: 'ERROR_AV_UPNP_AVT_CONTENT_BUSY' },
      { code: 716, message: 'ERROR_AV_UPNP_AVT_RESOURCE_NOT_FOUND' },
      { code: 717, message: 'ERROR_AV_UPNP_AVT_UNSUPPORTED_PLAY_SPEED' },
      { code: 718, message: 'ERROR_AV_UPNP_AVT_INVALID_INSTANCE_ID' }
    ],
    '/MediaRenderer/RenderingControl/Control': [
      { code: 701, message: 'ERROR_AV_UPNP_RC_INVALID_PRESET_NAME' },
      { code: 702, message: 'ERROR_AV_UPNP_RC_INVALID_INSTANCE_ID' }
    ],
    '/MediaServer/ContentDirectory/Control': [
      { code: 701, message: 'ERROR_AV_UPNP_CD_NO_SUCH_OBJECT' },
      { code: 702, message: 'ERROR_AV_UPNP_CD_INVALID_CURRENTTAGVALUE' },
      { code: 703, message: 'ERROR_AV_UPNP_CD_INVALID_NEWTAGVALUE' },
      { code: 704, message: 'ERROR_AV_UPNP_CD_REQUIRED_TAG_DELETE' },
      { code: 705, message: 'ERROR_AV_UPNP_CD_READONLY_TAG_UPDATE' },
      { code: 706, message: 'ERROR_AV_UPNP_CD_PARAMETER_NUM_MISMATCH' },
      { code: 708, message: 'ERROR_AV_UPNP_CD_BAD_SEARCH_CRITERIA' },
      { code: 709, message: 'ERROR_AV_UPNP_CD_BAD_SORT_CRITERIA' },
      { code: 710, message: 'ERROR_AV_UPNP_CD_NO_SUCH_CONTAINER' },
      { code: 711, message: 'ERROR_AV_UPNP_CD_RESTRICTED_OBJECT' },
      { code: 712, message: 'ERROR_AV_UPNP_CD_BAD_METADATA' },
      { code: 713, message: 'ERROR_AV_UPNP_CD_RESTRICTED_PARENT_OBJECT' },
      { code: 714, message: 'ERROR_AV_UPNP_CD_NO_SUCH_SOURCE_RESOURCE' },
      { code: 715, message: 'ERROR_AV_UPNP_CD_SOURCE_RESOURCE_ACCESS_DENIED' },
      { code: 716, message: 'ERROR_AV_UPNP_CD_TRANSFER_BUSY' },
      { code: 717, message: 'ERROR_AV_UPNP_CD_NO_SUCH_FILE_TRANSFER' },
      { code: 718, message: 'ERROR_AV_UPNP_CD_NO_SUCH_DESTINATION_RESOURCE' },
      { code: 719, message: 'ERROR_AV_UPNP_CD_DESTINATION_RESOURCE_ACCESS_DENIED' },
      { code: 720, message: 'ERROR_AV_UPNP_CD_REQUEST_FAILED' }
    ]
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
  * based on https://medium.com/better-programming/how-to-perform-soap-requests-with-node-js-4a9627070eb6
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
        console.error(`request failed: ${error}`);
        // In case of an SOAP error error.reponse helds the details.
        // That goes usually together with status code 500 - triggering catch
        // Experience: When using reject(error) the error.reponse get lost.
        // Thats why error.response is checked and handled.
        let myError;
        if (error.response) { // Indicator for SOAP Error
          if (error.message.startsWith('Request failed with status code 500')) {
            const errorCode = (function (data) {
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

  /** parseSoapBody transforms soap response to simple JSON format
  * @param  {Object} body response from SONOS player on a SOAP request
  * @return {promise} JSON format
  */
  parseSoapBody: (body) => {
    return xml2js.parseStringPromise(body, { mergeAttrs: true, explicitArray: false });
  }

};
